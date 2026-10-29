import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { llamaMetadata, llamaModels, llamaStream } from '../electron/llama-http';
import { AppService } from '../electron/service';
import { DEFAULT_PROFILE, getModelProfile } from '../shared/model-profile';
import { DEFAULT_LLAMA, validateLlamaConfig } from '../shared/provider-settings';
import { validateLlamaFile } from '../electron/providers';
import { validateState } from '../electron/store';

const servers:http.Server[]=[];const dirs:string[]=[];const services:AppService[]=[];
async function endpoint(handler:http.RequestListener){const server=http.createServer(handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;}
async function app(){const dir=await mkdtemp(path.join(os.tmpdir(),'jaxos-llama-'));dirs.push(dir);const service=new AppService(dir);services.push(service);await service.init();return service;}
async function until(check:()=>boolean){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}
const models={data:[{id:'Local model Q4.gguf',owned_by:'llamacpp',meta:{n_ctx:4096,n_ctx_train:32768,size:1000,n_params:600000000,ftype:'Q4_K'}}]};
const props={model_path:'/weights/local.gguf',default_generation_settings:{n_ctx:4096},chat_template:'{% if enable_thinking %}',chat_template_caps:{supports_tools:true}};
const event=(data:unknown)=>`data: ${typeof data==='string'?data:JSON.stringify(data)}\n\n`;
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.shutdown()));await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());})));await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});

describe('llama.cpp transport and provider settings',()=>{
  it('reports actual capabilities/context and keeps unreported VRAM absent',async()=>{
    const url=await endpoint((req,res)=>res.end(JSON.stringify(req.url==='/v1/models'?models:props)));
    expect(await llamaModels({url})).toEqual([{name:'Local model Q4.gguf',size:1000}]);
    const result=await llamaMetadata({url},'Local model Q4.gguf');
    expect(result.details).toMatchObject({local:true,thinking:true,tools:true,maxContext:32768,effectiveContext:4096});
    expect(result.loaded[0]).not.toHaveProperty('vram');
    await expect(llamaMetadata({url},'missing')).rejects.toThrow(/not reported/);
  });
  it('reassembles fragmented SSE tool calls, separates reasoning and requires terminal completion',async()=>{
    let body:any;let auth='';
    const url=await endpoint((req,res)=>{auth=String(req.headers.authorization);let text='';req.on('data',c=>text+=c);req.on('end',()=>{body=JSON.parse(text);const payload=[
      {choices:[{index:0,delta:{reasoning_content:'Check first.'},finish_reason:null}]},
      {choices:[{index:0,delta:{tool_calls:[{index:0,id:'call-1',function:{name:'project_',arguments:'{"kind":'}}]},finish_reason:null}]},
      {choices:[{index:0,delta:{tool_calls:[{index:0,function:{name:'run',arguments:'"drc"}'}}]},finish_reason:'tool_calls'}]},
      {choices:[],usage:{prompt_tokens:19,completion_tokens:8}},'[DONE]',
    ].map(event).join('').replaceAll('\n','\r\n');for(let i=0;i<payload.length;i+=7)res.write(payload.slice(i,i+7));res.end();});});
    let content='',reasoning='';const result=await llamaStream({url,model:'Local model Q4.gguf',messages:[{role:'user',content:'Check board'}],signal:new AbortController().signal,profile:{...DEFAULT_PROFILE,thinking:'off'},onToken:t=>content+=t,onReasoning:t=>reasoning+=t},{url,key:'session-only'});
    expect(content).toBe('');expect(reasoning).toBe('Check first.');expect(auth).toBe('Bearer session-only');
    expect(result).toMatchObject({finishReason:'tool_calls',usage:{inputTokens:19,outputTokens:8},toolCalls:[{id:'call-1',name:'project_run',arguments:{kind:'drc'}}]});
    expect(body).toMatchObject({stream:true,chat_template_kwargs:{enable_thinking:false},max_tokens:2048});
  });
  it.each([
    event({choices:[{index:0,delta:{content:'partial'},finish_reason:null}]}),
    event({choices:[{index:0,delta:{tool_calls:[{index:0,function:{name:'project_run',arguments:'{"kind":'}}]},finish_reason:'tool_calls'}]})+event('[DONE]'),
    event({choices:[{index:0,delta:{tool_calls:[{index:8,function:{name:'project_run',arguments:'{}'}}]},finish_reason:'tool_calls'}]})+event('[DONE]'),
  ])('rejects truncated or malformed streams without producing executable calls',async payload=>{
    const url=await endpoint((_req,res)=>res.end(payload));
    await expect(llamaStream({url,model:'local',messages:[],signal:new AbortController().signal,onToken:()=>{}},{url})).rejects.toThrow();
  });
  it('cancels a stalled stream and does not follow redirects',async()=>{
    const controller=new AbortController();const url=await endpoint((_req,res)=>res.write(event({choices:[{index:0,delta:{content:'one'},finish_reason:null}]})));
    await expect(llamaStream({url,model:'local',messages:[],signal:controller.signal,onToken:()=>controller.abort()},{url})).rejects.toThrow();
    const redirect=await endpoint((_req,res)=>{res.writeHead(302,{Location:url});res.end();});
    await expect(llamaModels({url:redirect})).rejects.toThrow();
  });
  it('isolates provider profiles, preserves legacy data and does not persist session credentials',async()=>{
    const service=await app();
    const url=await endpoint((req,res)=>res.end(JSON.stringify(req.url==='/v1/models'?models:props)));
    await service.saveSettings({provider:'llamacpp',llama:{...DEFAULT_LLAMA,mode:'external',url},model:'Local model Q4.gguf'});
    service.setLlamaSessionKey('private-in-memory');
    const profile={...DEFAULT_PROFILE,contextTokens:4096,outputTokens:512};
    await service.saveModelProfile({model:'Local model Q4.gguf',profile});
    expect(getModelProfile(service.getState().settings)).toEqual(profile);
    await expect(service.saveModelProfile({model:'Local model Q4.gguf',profile:{...profile,contextTokens:8192}})).rejects.toThrow(/allocation/);
    expect(JSON.stringify(service.getState())).not.toContain('private-in-memory');
    expect(()=>validateState(service.getState())).not.toThrow();
    await service.saveSettings({provider:'ollama'});expect(service.getState().settings.model).toBe('qwen3:0.6b');expect(getModelProfile(service.getState().settings)).toEqual(DEFAULT_PROFILE);
    await service.saveSettings({provider:'llamacpp'});expect(getModelProfile(service.getState().settings)).toEqual(profile);
    await service.shutdown();const restored=new AppService(service.dataDir);services.push(restored);await restored.init();
    expect(restored.getState().settings.model).toBe('Local model Q4.gguf');expect(getModelProfile(restored.getState().settings)).toEqual(profile);
  });
  it('streams attached local inference through the durable service and blocks endpoint changes during work',async()=>{
    let release:(()=>void)|undefined;
    const url=await endpoint((req,res)=>{if(req.url==='/v1/models')return res.end(JSON.stringify(models));if(req.url?.startsWith('/props'))return res.end(JSON.stringify(props));req.resume();res.write(event({choices:[{index:0,delta:{content:'Ready'},finish_reason:null}]}));release=()=>res.end(event({choices:[{index:0,delta:{},finish_reason:'stop'}]})+event('[DONE]'));});
    const service=await app();await service.saveSettings({provider:'llamacpp',llama:{...DEFAULT_LLAMA,mode:'external',url},model:'Local model Q4.gguf'});await service.saveModelProfile({model:'Local model Q4.gguf',profile:{...DEFAULT_PROFILE,contextTokens:4096,outputTokens:512}});
    await service.sendMessage({conversationId:service.getState().activeConversationId!,text:'Hello'});await until(()=>!!release);
    await expect(service.saveSettings({provider:'ollama'})).rejects.toThrow(/Stop active/);
    expect(()=>service.setLlamaSessionKey('different')).toThrow(/Stop active/);release!();
    await until(()=>service.getState().conversations[0].messages.at(-1)?.status==='complete');
    expect(service.getState().conversations[0].messages.at(-1)).toMatchObject({content:'Ready',provider:'llamacpp',stage:'analysis'});
  });
  it('rejects nonlocal configuration and invalid GGUF files before process launch',async()=>{
    expect(()=>validateLlamaConfig({...DEFAULT_LLAMA,url:'http://example.com'})).toThrow(/localhost/);
    expect(()=>validateLlamaConfig({...DEFAULT_LLAMA,gpuLayers:1000})).toThrow(/layers/);
    const service=await app();const file=path.join(service.dataDir,'bad.gguf');await writeFile(file,Buffer.alloc(2048));
    await expect(validateLlamaFile(file,'modelPath')).rejects.toThrow(/header/);
    await expect(service.saveSettings({llama:{...DEFAULT_LLAMA,executable:'/bin/sh'} as any})).rejects.toThrow(/fields/);
  });
});
