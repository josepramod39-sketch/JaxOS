import { test, expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { DesktopHarness } from './harness';
import { getModelProfile } from '../../shared/model-profile';

test('managed GGUF lifecycle, thinking, cancellation and orphan cleanup work in real Electron',async({},testInfo)=>{
  test.skip(process.env.JAXOS_LIVE_LLAMA_TEST!=='1','Requires a local llama-server binary and GGUF.');test.setTimeout(300000);
  const desktop=await DesktopHarness.create();
  try{
    const page=await desktop.launch();await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('combobox',{name:'Model runtime',exact:true}).selectOption('llamacpp');
    await page.getByRole('button',{name:'Choose llama-server',exact:true}).click();
    await expect.poll(async()=>Boolean((await desktop.state()).settings.llama?.executable)).toBe(true);
    await page.getByRole('button',{name:'Choose GGUF model',exact:true}).click();
    await expect.poll(async()=>Boolean((await desktop.state()).settings.llama?.modelPath)).toBe(true);
    await page.locator('.runtime-options summary').click();
    await page.getByRole('spinbutton',{name:'GPU layers',exact:true}).fill('0');
    await page.getByRole('spinbutton',{name:'CPU threads',exact:true}).fill('2');
    await page.getByRole('button',{name:'Save and connect',exact:true}).click();
    await expect.poll(async()=>(await desktop.state()).settings.llama?.gpuLayers).toBe(0);
    await page.getByText('Generation profile',{exact:false}).first().click();
    await page.getByRole('spinbutton',{name:'Context tokens',exact:true}).fill('4096');
    await page.getByRole('spinbutton',{name:'Maximum output tokens',exact:true}).fill('512');
    await page.getByRole('button',{name:'Save model profile',exact:true}).click();
    await expect.poll(async()=>getModelProfile((await desktop.state()).settings).contextTokens).toBe(4096);
    await page.getByRole('button',{name:'Load model',exact:true}).click();
    await expect.poll(async()=>(await desktop.state()).modelOperations?.[0],{timeout:120000}).toMatchObject({kind:'load',status:'complete'});
    expect(await page.evaluate(()=>window.jaxos.getLlamaStatus())).toMatchObject({running:true,owned:true,contextTokens:4096,gpuLayers:0});
    await expect(page.getByText(/Loaded · .*VRAM not reported.*4,096 effective context/)).toBeVisible();
    await expect(page.locator('#thinking-mode option[value="on"]')).toBeEnabled();
    await page.getByRole('combobox',{name:'Thinking',exact:true}).selectOption('on');
    await page.getByRole('button',{name:'Save model profile',exact:true}).click();
    await expect.poll(async()=>getModelProfile((await desktop.state()).settings).thinking).toBe('on');
    await page.locator('.runtime-options summary').click();
    await page.locator('.settings-body').evaluate(e=>e.scrollTop=0);
    await page.screenshot({path:testInfo.outputPath('actual-llama-settings-1440.png')});
    await page.setViewportSize({width:740,height:560});await page.screenshot({path:testInfo.outputPath('actual-llama-settings-740.png')});
    await page.locator('.settings-disclosure').first().evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:testInfo.outputPath('actual-llama-profile-740.png')});
    await page.locator('.model-runtime').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:testInfo.outputPath('actual-llama-loaded-740.png')});
    await page.setViewportSize({width:1440,height:960});await page.locator('.model-runtime').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:testInfo.outputPath('actual-llama-loaded-1440.png')});
    await page.getByRole('button',{name:'Close Settings',exact:true}).click();
    await page.getByRole('textbox',{name:'Message JaxOS',exact:true}).fill('Think briefly: what is 2 plus 2? Give a very short final answer.');await page.getByRole('button',{name:'Send message',exact:true}).click();
    await expect.poll(async()=>(await desktop.state()).conversations[0].messages.at(-1)?.status,{timeout:120000}).toBe('complete');
    const answer=(await desktop.state()).conversations[0].messages.at(-1)!;
    expect(answer.reasoning?.length).toBeGreaterThan(0);expect(answer.content.trim().length).toBeGreaterThan(0);expect(answer.provider).toBe('llamacpp');expect(answer.modelSource).toBe(process.env.JAXOS_TEST_LLAMA_MODEL);expect(answer.runtimeVersion).toMatch(/build|version/i);expect(answer.effectiveContext).toBe(4096);expect(answer.usage?.outputTokens).toBeGreaterThan(0);
    await page.locator('.message-reasoning summary').click();await page.screenshot({path:testInfo.outputPath('actual-llama-reasoning-1440.png')});
    await page.evaluate(async()=>{const s=await window.jaxos.getState();await window.jaxos.sendMessage({conversationId:s.activeConversationId!,text:'Think through a detailed mathematical derivation of the first fifty prime numbers, checking every one before the final answer.'});});
    await expect.poll(async()=>(await desktop.state()).conversations[0].messages.at(-1)?.reasoning?.length??0,{timeout:30000}).toBeGreaterThan(0);
    await page.evaluate(async()=>window.jaxos.cancelChat((await window.jaxos.getState()).activeConversationId!));
    await expect.poll(async()=>(await desktop.state()).conversations[0].messages.at(-1)?.status).toBe('cancelled');
    await desktop.app!.evaluate(({app})=>{const worker=app.getAppMetrics().find(m=>m.type==='Utility'&&JSON.stringify(m).includes('JaxOS workspace coordinator'));if(!worker)throw new Error('Coordinator missing');process.kill(worker.pid,'SIGKILL');});
    await expect(page.getByRole('button',{name:'Reconnect service',exact:true})).toBeVisible();
    const runtimeDir=path.join(desktop.temporaryRoot,'data','workspace','llama-runtime');
    await expect.poll(async()=>await readdir(runtimeDir),{timeout:10000}).toEqual([]);
    await page.getByRole('button',{name:'Reconnect service',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.jaxos.getLlamaStatus())).toMatchObject({running:false});
    expect((await desktop.state()).settings.provider).toBe('llamacpp');expect((await desktop.state()).conversations[0].messages.find(m=>m.id===answer.id)?.reasoning).toBe(answer.reasoning);
    await page.evaluate(async()=>{const s=await window.jaxos.getState();await window.jaxos.saveModelProfile({model:s.settings.model,profile:{contextTokens:8192,outputTokens:512,thinking:'off',temperature:0,keepAliveSeconds:1,gpu:'auto'}});await window.jaxos.startModelOperation({model:s.settings.model,kind:'load'});});
    await expect.poll(async()=>(await desktop.state()).modelOperations?.[0],{timeout:120000}).toMatchObject({kind:'load',status:'complete'});
    await expect.poll(()=>page.evaluate(()=>window.jaxos.getLlamaStatus()),{timeout:10000}).toMatchObject({running:false});
    expect(desktop.consoleErrors).toEqual([]);
  }finally{await desktop.dispose();}
});

test('a real local GGUF selects a stage tool and records actual KiCad failure evidence',async({},testInfo)=>{
  test.skip(process.env.JAXOS_LIVE_LLAMA_TEST!=='1','Requires a local llama-server binary and GGUF.');test.setTimeout(240000);
  const desktop=await DesktopHarness.create('fault');
  try{
    const page=await desktop.launch();
    await page.evaluate(async()=>{
      await window.jaxos.saveSettings({provider:'llamacpp',llama:{mode:'managed',url:'http://127.0.0.1:8080',gpuLayers:0,threads:2}});
      await window.jaxos.chooseLlamaFile('executable');await window.jaxos.chooseLlamaFile('modelPath');
      await window.jaxos.saveModelProfile({model:'jaxos-gguf',profile:{contextTokens:8192,outputTokens:512,thinking:'off',temperature:0,keepAliveSeconds:60,gpu:'auto'}});
      await window.jaxos.chooseProject();const state=await window.jaxos.getState();await window.jaxos.setConversationStage(state.activeConversationId!,'test');
      await window.jaxos.sendMessage({conversationId:state.activeConversationId!,text:'Call project_run with kind drc now to check the attached board. Do not call project_inspect. Report the actual tool outcome briefly.'});
    });
    await expect.poll(async()=>{const s=await desktop.state();return s.conversations.find(c=>c.id===s.activeConversationId)?.messages.at(-1)?.status;},{timeout:150000}).toBe('complete');
    const state=await desktop.state();const answer=state.conversations.find(c=>c.id===state.activeConversationId)!.messages.at(-1)!;
    const step=answer.toolSteps?.find(s=>s.name==='project_run'&&s.arguments.kind==='drc');expect(step).toBeTruthy();expect(step?.status).toBe('complete');
    const run=state.runs.find(r=>r.id===step!.runId)!;expect(run).toMatchObject({kind:'drc',status:'failed',stale:false});expect(run.findings.length).toBeGreaterThan(0);expect(run.toolVersion).toMatch(/9\./);expect(run.command.length).toBeGreaterThan(0);
    await page.locator('.message-tool summary').filter({hasText:'KiCad DRC'}).first().click();
    await page.screenshot({path:testInfo.outputPath('actual-stage-tool-failure-1440.png')});
    await page.setViewportSize({width:740,height:560});await page.locator('.chat-scroll').evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.screenshot({path:testInfo.outputPath('actual-stage-tool-failure-740.png')});
    await desktop.restart();const restored=await desktop.state();expect(restored.conversations.find(c=>c.id===state.activeConversationId)?.messages.at(-1)?.toolSteps).toEqual(answer.toolSteps);expect(restored.runs.find(r=>r.id===run.id)?.status).toBe('failed');expect(desktop.consoleErrors).toEqual([]);
  }finally{await desktop.dispose();}
});
