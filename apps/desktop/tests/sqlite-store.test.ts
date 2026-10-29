import { mkdtemp, readFile, writeFile, rm, copyFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultState, WorkspaceStore } from '../electron/store';
import { SqliteWorkspaceStore } from '../electron/sqlite-store';
import type { AppState } from '../shared/types';
import type { CommandReceipt } from '../shared/persistence';
import { DEFAULT_PROFILE, profileKey } from '../shared/model-profile';

const directories: string[] = [];
const stores: SqliteWorkspaceStore[] = [];
async function directory() { const dir=await mkdtemp(path.join(os.tmpdir(),'jaxos-sqlite-'));directories.push(dir);return dir; }
function repository(dir: string) { const store=new SqliteWorkspaceStore(dir);stores.push(store);return store; }
afterEach(async()=>{for(const store of stores.splice(0))await store.close();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
const date='2026-10-20T10:00:00.000Z';
function fixture(): AppState {
  const state=defaultState();
  state.projects=[{id:'project',name:'Device',path:'/projects/Device',fingerprint:'original',goal:'A quiet amplifier',notes:'Keep connector labels.',checks:['ERC'],connectedAt:date,refreshedAt:date}];
  state.conversations=[{id:'conversation',projectId:'project',title:'Amplifier design',createdAt:date,updatedAt:date,messages:[
    {id:'question',role:'user',status:'complete',content:'Find the copper connector requirements.',createdAt:date},
    {id:'answer',role:'assistant',status:'complete',content:'Keep copper clearance around the connector.',reasoning:'Private reasoning term: secretreasoning',model:'qwen3:0.6b',inference:{...DEFAULT_PROFILE,thinking:'on'},usage:{inputTokens:37,outputTokens:12},finishReason:'stop',createdAt:date},
  ]}];
  state.runs=[{id:'run',projectId:'project',kind:'erc',status:'passed',createdAt:date,finishedAt:date,inputFingerprint:'original',stale:false,toolVersion:'9.0.2',command:['kicad-cli','sch','erc'],exitCode:0,summary:'Passed',log:'Actual evidence',findings:[],artifacts:[{id:'artifact',path:'/data/runs/run/report.json',name:'report.json',mime:'application/json',bytes:15}]}];
  state.dailyItems=[{id:'daily',text:'Order connectors',done:false,createdAt:date}];
  state.settings.modelProfiles={[profileKey(state.settings.ollamaUrl,state.settings.model)]:{...DEFAULT_PROFILE,contextTokens:4096,thinking:'on'}};
  state.settings.runInBackground=true;state.activeConversationId='conversation';state.activeProjectId='project';
  state.modelOperations=[{id:'load',model:'qwen3:0.6b',kind:'load',status:'complete',createdAt:date,finishedAt:date,summary:'Loaded'}];
  return state;
}
function receipt(id='once'): CommandReceipt { return {id,kind:'chat',inputHash:'digest',result:{conversationId:'conversation',messageId:'answer'},createdAt:date}; }

describe('transactional SQLite workspace',()=>{
  it('imports every legacy record without changing either source and reopens without importing again',async()=>{
    const dir=await directory();const legacy=new WorkspaceStore(dir);await legacy.load();const state=fixture();await legacy.save(state);
    const primary=await readFile(legacy.file);const backup=await readFile(legacy.backupFile);
    const store=repository(dir);expect(await store.load()).toEqual(state);
    expect(store.info()).toMatchObject({backend:'sqlite',version:1,search:'fts5',importedFrom:'workspace.json'});
    expect(await readFile(legacy.file)).toEqual(primary);
    expect(store.search('copper connector').hits).toHaveLength(2);
    expect(store.tasks().map(t=>t.kind).sort()).toEqual(['chat','kicad','model']);
    await store.close();await writeFile(legacy.file,'later legacy changes must not replace the database');
    expect(await repository(dir).load()).toEqual(state);
    expect(await readFile(legacy.backupFile)).toEqual(backup);
    await writeFile(legacy.file,primary);expect(await readFile(legacy.file)).toEqual(primary);
  });

  it('imports a valid backup without renaming or repairing a corrupt legacy primary',async()=>{
    const dir=await directory();const state=fixture();const original='{unfinished';const saved=JSON.stringify(state);
    await writeFile(path.join(dir,'workspace.json'),original);await writeFile(path.join(dir,'workspace.json.bak'),saved);
    const store=repository(dir);const loaded=await store.load();expect(loaded.dailyItems).toEqual(state.dailyItems);expect(loaded.notice).toContain('legacy backup');
    expect(store.info().importedFrom).toBe('workspace.json.bak');
    expect(await readFile(path.join(dir,'workspace.json'),'utf8')).toBe(original);expect(await readFile(path.join(dir,'workspace.json.bak'),'utf8')).toBe(saved);
  });

  it('preserves unrecoverable sources and refuses a corrupt, foreign or future database',async()=>{
    const dir=await directory();await writeFile(path.join(dir,'workspace.json'),'broken');
    await expect(repository(dir).load()).rejects.toThrow(/preserved/);
    expect(await readFile(path.join(dir,'workspace.json'),'utf8')).toBe('broken');
    await writeFile(path.join(dir,'workspace.json'),JSON.stringify(fixture()));
    expect((await repository(dir).load()).conversations).toHaveLength(1);
    for(const store of stores)await store.close();
    const dbfile=path.join(dir,'workspace.sqlite');const db=new DatabaseSync(dbfile);db.exec('PRAGMA user_version=99');db.close();
    await expect(repository(dir).load()).rejects.toThrow(/Unsupported/);
    const foreign=await directory();const other=new DatabaseSync(path.join(foreign,'workspace.sqlite'));other.exec('CREATE TABLE private_data(value TEXT)');other.close();
    await expect(repository(foreign).load()).rejects.toThrow(/foreign/);
    const corrupt=await directory();await writeFile(path.join(corrupt,'workspace.sqlite'),'not a database');await writeFile(path.join(corrupt,'workspace.json'),JSON.stringify(fixture()));
    await expect(repository(corrupt).load()).rejects.toThrow(/preserved/);expect(await readFile(path.join(corrupt,'workspace.sqlite'),'utf8')).toBe('not a database');
  });

  it('rolls back a failed migration and retries it without duplicate records',async()=>{
    const dir=await directory();await writeFile(path.join(dir,'workspace.json'),JSON.stringify(fixture()));
    const db=new DatabaseSync(path.join(dir,'workspace.sqlite'));
    db.exec("PRAGMA application_id=1245796431; CREATE TABLE meta(key TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TRIGGER fail_import BEFORE INSERT ON meta WHEN new.key='workspace' BEGIN SELECT RAISE(ABORT,'simulated migration interruption'); END;");
    db.close();
    await expect(repository(dir).load()).rejects.toThrow(/simulated migration interruption/);
    const failed=new DatabaseSync(path.join(dir,'workspace.sqlite'));expect(failed.prepare('PRAGMA user_version').get()?.user_version).toBe(0);expect(failed.prepare('SELECT count(*) AS n FROM meta').get()?.n).toBe(0);failed.exec('DROP TRIGGER fail_import');failed.close();
    const store=repository(dir);expect(await store.load()).toEqual(fixture());await store.close();expect(await repository(dir).load()).toEqual(fixture());
  });

  it('commits state, search, task transitions and admission receipts atomically',async()=>{
    const dir=await directory();const store=repository(dir);await store.load();const state=fixture();await store.save(state);
    const before=store.events();const fault=new DatabaseSync(store.file);fault.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT,'disk write fault'); END;");fault.close();
    const changed=structuredClone(state);changed.conversations[0].messages[1].status='cancelled';changed.conversations[0].messages[1].content='Uncommitted replacement';
    await expect(store.save(changed,receipt())).rejects.toThrow(/disk write fault/);
    expect(store.events()).toEqual(before);expect(store.getCommand('once')).toBeUndefined();expect(store.tasks().find(t=>t.kind==='chat')?.status).toBe('succeeded');expect(store.search('copper connector').hits).toHaveLength(2);
    const repair=new DatabaseSync(store.file);repair.exec('DROP TRIGGER fail_receipt');repair.close();
    await store.save(changed,receipt());const cursor=before.at(-1)!.sequence;
    expect(store.events(cursor).map(e=>e.type)).toEqual(['task.status','command.admitted','workspace.saved']);
    expect(store.tasks().find(t=>t.kind==='chat')?.status).toBe('cancelled');expect(store.getCommand('once')).toEqual(receipt());
    await store.close();const reopened=repository(dir);expect(await reopened.load()).toEqual(changed);expect(reopened.getCommand('once')).toEqual(receipt());expect(reopened.events(cursor)[0].sequence).toBeGreaterThan(cursor);
    await expect(reopened.save(state,receipt())).rejects.toThrow(/already admitted/);expect(reopened.search('Uncommitted').hits).toHaveLength(1);
  });

  it('searches final message text safely, tracks edits/deletes and rebuilds a damaged index',async()=>{
    const dir=await directory();const store=repository(dir);await store.load();const state=fixture();await store.save(state);
    expect(store.search('COPPER connec').hits).toHaveLength(2);expect(store.search('secretreasoning').hits).toHaveLength(0);
    expect(store.search('" OR * --').hits).toHaveLength(0);expect(store.search('铜线').hits).toHaveLength(0);expect(()=>store.search('x'.repeat(301))).toThrow();
    const index=new DatabaseSync(store.file);index.exec("INSERT INTO messages_fts(messages_fts) VALUES('delete-all')");index.close();await store.close();
    const reopened=repository(dir);await reopened.load();expect(reopened.search('copper').hits).toHaveLength(2);
    state.conversations[0].messages[1].content='A revised regulator choice';state.conversations[0].messages.shift();await reopened.save(state);
    expect(reopened.search('copper').hits).toHaveLength(0);expect(reopened.search('regulator').hits[0]).toMatchObject({messageId:'answer',conversationId:'conversation',title:'Amplifier design'});
    reopened.rebuildSearch();expect(reopened.search('regulator').hits).toHaveLength(1);
  });

  it('exports a verified online database backup with history, events and command receipts',async()=>{
    const dir=await directory();const output=await directory();const store=repository(dir);await store.load();const state=fixture();await store.save(state,receipt());
    await expect(store.backupTo(path.join(dir,'workspace.sqlite'))).rejects.toThrow(/outside/);
    const destination=path.join(output,'backup.sqlite');await writeFile(destination,'previous destination');await store.backupTo(destination);
    const restore=await directory();await copyFile(destination,path.join(restore,'workspace.sqlite'));const restored=repository(restore);expect(await restored.load()).toEqual(state);expect(restored.getCommand('once')).toEqual(receipt());expect(restored.search('connector').hits).toHaveLength(2);expect(restored.events()).toEqual(store.events());
    state.dailyItems[0].done=true;await store.save(state);expect((await restored.load()).dailyItems[0].done).toBe(false);expect((await readdir(output)).some(name=>name.endsWith('.tmp'))).toBe(false);
  });
});
