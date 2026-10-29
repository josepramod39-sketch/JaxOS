import { test, expect } from '@playwright/test';
import { readFile, writeFile, copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DesktopHarness } from './harness';
import { defaultState } from '../../electron/store';
import { SqliteWorkspaceStore } from '../../electron/sqlite-store';

test('legacy history migrates once, search reveals an earlier message and database backups restore',async({},testInfo)=>{
  const desktop=await DesktopHarness.create();let restore: string | undefined;
  try {
    const date='2026-10-20T08:00:00.000Z';const legacy=defaultState();
    legacy.conversations=[{id:'connector-review',title:'Connector review · test fixture',createdAt:date,updatedAt:date,messages:[
      {id:'old-user',role:'user',content:'Review copper connector clearance on the sensor board.',status:'complete',createdAt:date},
      {id:'old-answer',role:'assistant',content:'Keep the copper connector revision with the saved checks.',reasoning:'unindexedreasoning',status:'complete',createdAt:date},
      ...Array.from({length:36},(_,i)=>({id:'later-'+i,role:i%2?'assistant' as const:'user' as const,content:`Later test-fixture note ${i+1}. Review the saved revision before the next run.`,status:'complete' as const,createdAt:date})),
    ]},{id:'current',title:'New conversation',createdAt:date,updatedAt:date,messages:[]}];legacy.activeConversationId='current';
    const original=JSON.stringify(legacy,null,2)+'\n';const workspace=path.join(desktop.temporaryRoot,'data','workspace');await mkdir(workspace);const legacyFile=path.join(workspace,'workspace.json');await writeFile(legacyFile,original);
    let page=await desktop.launch();
    await desktop.app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
    expect(await page.evaluate(()=>window.jaxos.getStorageInfo())).toMatchObject({backend:'sqlite',search:'fts5',importedFrom:'workspace.json'});
    expect(await readFile(legacyFile,'utf8')).toBe(original);
    const search=page.getByRole('searchbox',{name:'Search saved messages'});await search.fill('copper connector');await expect(page.getByRole('navigation',{name:'Message search results'}).getByRole('button')).toHaveCount(2);
    await page.getByRole('navigation',{name:'Message search results'}).getByRole('button').filter({hasText:'You ·'}).click();
    await expect(page.locator('[data-message-id="old-user"]')).toBeInViewport();await expect(page.locator('[data-message-id="old-user"]')).toHaveClass(/message-found/);
    async function capture(name:string){const file=testInfo.outputPath(name+'.png');await page.screenshot({path:file});await testInfo.attach(name,{path:file,contentType:'image/png'});}
    await capture('actual-history-search-1440');
    await search.fill('unindexedreasoning');await expect(page.getByText('No saved messages match.',{exact:true})).toBeVisible();await capture('actual-history-empty-1440');
    await search.fill('copper');await expect(page.getByRole('navigation',{name:'Message search results'}).getByRole('button')).toHaveCount(2);
    await desktop.app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(740,560));await page.getByRole('button',{name:'Open navigation'}).click();await capture('actual-history-search-740');
    await page.getByRole('button',{name:'Close navigation'}).click({position:{x:370,y:60}});
    await desktop.app!.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.setMinimumSize(390,560);window.setSize(390,844);});await page.getByRole('button',{name:'Open navigation'}).click();await capture('exploratory-history-search-390');await page.getByRole('button',{name:'Close navigation'}).click({position:{x:370,y:60}});
    await desktop.app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
    await page.getByRole('button',{name:'Settings',exact:true}).click();const settings=page.getByRole('dialog',{name:'Settings'});
    await settings.getByRole('heading',{name:'Your workspace'}).scrollIntoViewIfNeeded();await expect(settings.getByText('Full-text message search',{exact:true})).toBeVisible();await capture('actual-storage-settings-1440');
    await settings.getByRole('button',{name:'Export database backup'}).click();await expect(settings.getByText(/^Database backup exported/)).toBeVisible();
    await settings.getByRole('button',{name:'Rebuild search index'}).click();await expect(settings.getByText('Message search index rebuilt from saved history.',{exact:true})).toBeVisible();
    await desktop.app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(740,560));await settings.getByRole('heading',{name:'Your workspace'}).evaluate(element=>element.scrollIntoView({block:'start'}));await expect(settings.getByRole('button',{name:'Export database backup'})).toBeInViewport();await capture('actual-storage-settings-740');await page.keyboard.press('Escape');
    page=await desktop.restart();expect(await readFile(legacyFile,'utf8')).toBe(original);expect((await desktop.state()).conversations[0].messages).toHaveLength(38);
    restore=await mkdtemp(path.join(os.tmpdir(),'jaxos-e2e-restore-'));await copyFile(path.join(desktop.temporaryRoot,'exports','jaxos-backup.sqlite'),path.join(restore,'workspace.sqlite'));
    const backup=new SqliteWorkspaceStore(restore);try {const saved=await backup.load();expect(saved.conversations[0].messages).toHaveLength(38);expect(backup.search('copper connector').hits).toHaveLength(2);expect(backup.tasks()).toHaveLength(19);}finally{await backup.close();}
    expect(desktop.consoleErrors).toEqual([]);
  }finally{await desktop.dispose();if(restore)await rm(restore,{recursive:true,force:true});}
});

test('search reports a stopped coordinator and retries after reconnect',async({},testInfo)=>{
  const desktop=await DesktopHarness.create();
  try {
    const page=await desktop.launch();await desktop.app!.evaluate(({app,BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(1440,960);const metric=app.getAppMetrics().find(item=>item.name==='JaxOS workspace coordinator');if(!metric)throw new Error('Coordinator not found');process.kill(metric.pid,'SIGKILL');});
    await expect(page.getByRole('button',{name:'Reconnect service'})).toBeVisible();
    // A live lock owner makes the real replacement coordinator refuse admission.
    const lock=path.join(desktop.temporaryRoot,'data','workspace','coordinator.lock');await writeFile(lock,JSON.stringify({pid:process.pid}));
    await page.getByRole('searchbox',{name:'Search saved messages'}).fill('connector');
    await expect(page.locator('.history-search-note[role="alert"]')).toContainText('already using');
    const capture=testInfo.outputPath('actual-history-error-1440.png');await page.screenshot({path:capture});await testInfo.attach('actual-history-error-1440',{path:capture,contentType:'image/png'});
    await rm(lock);await page.getByRole('button',{name:'Try search again'}).click();
    await expect(page.getByText('No saved messages match.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Clear message search'}).click();
    expect((await page.evaluate(()=>window.jaxos.getServiceStatus())).connected).toBe(true);
    expect(desktop.consoleErrors).toEqual([]);
  }finally{await desktop.dispose();}
});
