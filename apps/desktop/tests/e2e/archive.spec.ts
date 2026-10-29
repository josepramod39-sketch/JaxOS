import { test, expect } from '@playwright/test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPackage } from '@electron/asar';
import { appRoot, DesktopHarness } from './harness';

test('the archived application boots its separate coordinator and preserves data', async () => {
  const desktop = await DesktopHarness.create();
  try {
    const stage = path.join(desktop.temporaryRoot, 'archive-source');
    await mkdir(stage);
    for (const folder of ['dist', 'dist-electron']) await cp(path.join(appRoot, folder), path.join(stage, folder), { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
    await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: manifest.name, productName: 'JaxOS', version: manifest.version, main: manifest.main }));
    const archive = path.join(desktop.temporaryRoot, 'app.asar');
    await createPackage(stage, archive);
    await desktop.launch(archive);
    expect(await desktop.app!.evaluate(({ app }) => app.getAppPath())).toBe(archive);
    expect((await desktop.page.evaluate(() => window.jaxos.getServiceStatus())).connected).toBe(true);
    await desktop.page.evaluate(() => window.jaxos.addDailyItem('Saved from the archived app'));
    await desktop.app!.close(); desktop.app = undefined;
    await desktop.launch(archive);
    expect((await desktop.state()).dailyItems).toMatchObject([{ text: 'Saved from the archived app' }]);
    if(process.env.JAXOS_LIVE_LLAMA_TEST==='1'){
      await desktop.page.evaluate(async()=>{
        await window.jaxos.saveSettings({provider:'llamacpp',llama:{mode:'managed',url:'http://127.0.0.1:8080',gpuLayers:0,threads:2}});
        await window.jaxos.chooseLlamaFile('executable');await window.jaxos.chooseLlamaFile('modelPath');
        await window.jaxos.saveModelProfile({model:'jaxos-gguf',profile:{contextTokens:4096,outputTokens:256,thinking:'off',temperature:0,keepAliveSeconds:60,gpu:'auto'}});
        await window.jaxos.startModelOperation({model:'jaxos-gguf',kind:'load'});
      });
      await expect.poll(async()=>(await desktop.state()).modelOperations?.[0],{timeout:120000}).toMatchObject({status:'complete'});
      expect(await desktop.page.evaluate(()=>window.jaxos.getLlamaStatus())).toMatchObject({running:true,owned:true,contextTokens:4096});
      await desktop.page.evaluate(()=>window.jaxos.startModelOperation({model:'jaxos-gguf',kind:'unload'}));
      await expect.poll(async()=>(await desktop.state()).modelOperations?.[0]?.status).toBe('complete');
      expect(await desktop.page.evaluate(()=>window.jaxos.getLlamaStatus())).toMatchObject({running:false});
    }

    expect(desktop.consoleErrors).toEqual([]);
  } finally { await desktop.dispose(); }
});
