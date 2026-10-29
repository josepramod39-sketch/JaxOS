import { mkdtemp, rm, cp } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AppService } from '../electron/service';

const directories:string[]=[];const services:AppService[]=[];const servers:http.Server[]=[];
async function directory(){const dir=await mkdtemp(path.join(os.tmpdir(),'jaxos-admit-'));directories.push(dir);return dir;}
async function app(dir?:string){const service=new AppService(dir??await directory());services.push(service);await service.init();return service;}
async function until(check:()=>boolean){const deadline=Date.now()+10000;while(!check()){if(Date.now()>deadline)throw new Error('Task timed out');await new Promise(resolve=>setTimeout(resolve,15));}}
afterEach(async()=>{for(const service of services.splice(0))await service.shutdown();for(const server of servers.splice(0))await new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});

describe('durable task admission',()=>{
  it('admits concurrent identical chat commands once and reconciles the same ID after restart',async()=>{
    const service=await app();let calls=0;let receiptWasDurable=false;
    const server=http.createServer((req,res)=>{
      req.resume();if(req.url==='/api/show'){res.end(JSON.stringify({details:{format:'gguf'},capabilities:['completion']}));return;}
      calls++;const db=new DatabaseSync(path.join(service.dataDir,'workspace.sqlite'),{readOnly:true});
      try{receiptWasDurable=Boolean(db.prepare("SELECT id FROM commands WHERE id='one-message'").get());}finally{db.close();}
      res.end(JSON.stringify({message:{content:'Recorded once'},done:true,done_reason:'stop'})+'\n');
    });servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    await service.saveSettings({ollamaUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}`});
    const input={conversationId:service.getState().activeConversationId!,text:'One request',commandId:'one-message'};
    const fault=new DatabaseSync(path.join(service.dataDir,'workspace.sqlite'));fault.exec("CREATE TRIGGER fail_admission BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT,'admission storage fault'); END;");fault.close();
    await expect(service.sendMessage(input)).rejects.toThrow(/admission storage fault/);expect(service.getState().conversations[0].messages).toHaveLength(0);expect(calls).toBe(0);
    const repair=new DatabaseSync(path.join(service.dataDir,'workspace.sqlite'));repair.exec('DROP TRIGGER fail_admission');repair.close();
    await Promise.all([service.sendMessage(input),service.sendMessage(input),service.sendMessage(input)]);
    await until(()=>service.getState().conversations[0].messages.at(-1)?.status==='complete');
    expect(calls).toBe(1);expect(receiptWasDurable).toBe(true);expect(service.getState().conversations[0].messages).toHaveLength(2);
    expect(service.listTasks()[0]).toMatchObject({kind:'chat',status:'succeeded'});
    const events=service.listEvents({limit:500});expect(events.filter(e=>e.type==='command.admitted')).toHaveLength(1);
    expect(events.filter(e=>e.type==='task.status').map(e=>e.detail.status)).toEqual(['running','succeeded']);
    await expect(service.sendMessage({...input,text:'Different request'})).rejects.toThrow(/different request/);
    await expect(service.startModelOperation({model:'qwen3:0.6b',kind:'load',commandId:'one-message'})).rejects.toThrow(/different request/);
    await service.shutdown();const restored=await app(service.dataDir);await restored.sendMessage(input);expect(calls).toBe(1);expect(restored.getState().conversations[0].messages).toHaveLength(2);
  });

  it('runs a real KiCad check once for duplicate admissions and retains its evidence/status',async()=>{
    const service=await app();const projectDir=await directory();await cp(path.resolve('tests/fixtures/kicad/clean'),projectDir,{recursive:true});
    const project=await service.importProject(projectDir);const input={projectId:project.id,kind:'erc' as const,commandId:'one-check'};
    const [first,second]=await Promise.all([service.startRun(input),service.startRun(input)]);expect(second.id).toBe(first.id);
    await until(()=>service.getRun(first.id).status==='passed'&&service.listTasks().some(t=>t.sourceId===first.id&&t.status==='succeeded'));expect(service.getState().runs).toHaveLength(1);expect(service.listTasks().find(t=>t.kind==='kicad')).toMatchObject({sourceId:first.id,status:'succeeded'});
    await service.shutdown();const restored=await app(service.dataDir);expect(await restored.startRun(input)).toMatchObject({id:first.id,status:'passed',exitCode:0});expect(restored.getState().runs).toHaveLength(1);
  });
});
