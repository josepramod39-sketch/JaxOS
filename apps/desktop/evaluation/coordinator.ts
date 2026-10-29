import { fork, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ServiceClient } from '../electron/service-client';
import { evaluationSettings, type EvaluationModelOptions } from './model';

async function waitFor(check:()=>Promise<boolean>,ms=12000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Coordinator evaluation timed out.');}
function connect(dataDir:string){
  let child:ChildProcess;
  const client=new ServiceClient(()=>{
    child=fork(process.env.JAXOS_EVAL_HOST!,[dataDir],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc']});
    return {send:request=>{child.send(request);},onMessage:listener=>{child.on('message',listener);},onExit:listener=>{child.on('exit',listener);},kill:()=>{child.kill();}};
  },15000);
  return {client,child:()=>child!};
}
const last=async(client:ServiceClient,id:string)=>(await client.remote.getState()).conversations.find(c=>c.id===id)?.messages.at(-1);

/** Real private coordinator and SQLite; a controlled localhost server holds a stream open. */
export async function controlledCoordinator(root:string,mode:'cancel'|'crash'){
  let requests=0;const streams=new Set<http.ServerResponse>();
  const server=http.createServer((req,res)=>{
    req.resume();if(req.url==='/api/show'){res.end(JSON.stringify({details:{format:'gguf'},capabilities:['completion']}));return;}
    if(req.url!=='/api/chat'){res.writeHead(404);res.end();return;}
    requests++;streams.add(res);res.on('close',()=>streams.delete(res));res.write(JSON.stringify({message:{content:'Controlled partial answer'},done:false})+'\n');
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const {client,child}=connect(path.join(root,'workspace'));
  try{
    await client.start();await client.remote.saveSettings({ollamaUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}`});
    const id=(await client.remote.getState()).activeConversationId!;
    const request={conversationId:id,text:'Controlled streaming fixture',commandId:'evaluation-once'};
    await client.remote.sendMessage(request);
    await waitFor(async()=>Boolean((await last(client,id))?.content.includes('Controlled partial answer')));
    if(mode==='cancel'){
      await client.remote.cancelChat(id);await waitFor(async()=>(await last(client,id))?.status==='cancelled');
      const saved=await client.restart();const answer=saved.conversations.find(c=>c.id===id)?.messages.at(-1);
      return {pass:answer?.status==='cancelled'&&requests===1,observed:{status:answer?.status,requests,persisted:answer?.content.includes('Controlled partial answer')}};
    }
    await waitFor(async()=>{const db=new DatabaseSync(path.join(root,'workspace','workspace.sqlite'),{readOnly:true});try{return db.prepare("SELECT content FROM messages WHERE role='assistant'").all().some(row=>String(row.content).includes('Controlled partial answer'));}finally{db.close();}});
    child().kill('SIGKILL');await waitFor(async()=>!client.getStatus().connected);
    const restored=await client.remote.getState();const answer=restored.conversations.find(c=>c.id===id)?.messages.at(-1);
    await client.remote.sendMessage(request);const tasks=await client.remote.listTasks();
    return {pass:answer?.status==='error'&&answer.finishReason==='interrupted'&&requests===1&&tasks.some(t=>t.status==='interrupted'),observed:{status:answer?.status,finishReason:answer?.finishReason,requests,interruptedTask:tasks.some(t=>t.status==='interrupted'),partialPreserved:answer?.content.includes('Controlled partial answer')}};
  }finally{
    await client.stop().catch(()=>{});for(const stream of streams)stream.destroy();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}

/** Live inference goes through the same private coordinator RPC and isolated SQLite workspace. */
export async function liveCoordinator(root:string,options:EvaluationModelOptions,prompt:string,expectedPattern:string){
  const {client}=connect(path.join(root,'workspace'));
  try{
    await client.start();
    const settings=evaluationSettings(options);
    if(options.provider==='llamacpp'){
      await client.remote.setLlamaFile('executable',options.executable!);await client.remote.setLlamaFile('modelPath',options.modelPath!);
      await client.remote.saveSettings({provider:'llamacpp',model:options.model,llama:{mode:'managed',url:options.url,gpuLayers:options.gpuLayers,threads:options.threads}});
    }else await client.remote.saveSettings({provider:'ollama',ollamaUrl:settings.ollamaUrl,model:options.model});
    await client.remote.saveModelProfile({model:options.model,profile:options.profile});
    const id=(await client.remote.getState()).activeConversationId!;await client.remote.sendMessage({conversationId:id,text:prompt});
    await waitFor(async()=>{const a=await last(client,id);return Boolean(a&&a.status!=='streaming');},180000);
    const answer=(await last(client,id))!;
    return {pass:answer.status==='complete'&&new RegExp(expectedPattern).test(answer.content.trim()),observed:{status:answer.status,text:answer.content,reasoning:answer.reasoning,usage:answer.usage,finishReason:answer.finishReason,model:answer.model,provider:answer.provider,...(options.provider==='llamacpp'?{runtime:await client.remote.getLlamaStatus()}: {})}};
  }finally{await client.stop().catch(()=>{});}
}
