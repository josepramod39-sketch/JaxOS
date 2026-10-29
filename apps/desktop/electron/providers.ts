import { fork, execFile, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, realpath, stat, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import * as ollama from './ollama';
import { llamaJson, llamaMetadata, llamaModels, llamaStream, validateLlamaModel, type LlamaConnection } from './llama-http';
import { llamaConfig, LLAMA_MODEL, providerKind } from '../shared/provider-settings';
import type { GenerationInput, GenerationResult } from './inference-contract';
import type { InferenceProfile, LlamaStatus, ModelDetails, ModelInfo, Settings } from '../shared/types';

async function freePort(){const server=createServer();await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});const address=server.address();if(!address||typeof address==='string')throw new Error('Could not reserve a loopback port.');const port=address.port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
export async function validateLlamaFile(file:string,kind:'executable'|'modelPath'){
  if(typeof file!=='string'||!path.isAbsolute(file)||file.length>8192||file.includes('\0'))throw new Error('Choose an absolute local file path.');
  const canonical=await realpath(file);const info=await stat(canonical);if(!info.isFile())throw new Error('Choose a regular local file.');
  if(kind==='modelPath'){
    if(path.extname(canonical).toLowerCase()!=='.gguf'||info.size<1024)throw new Error('Choose a GGUF model file.');
    const {open}=await import('node:fs/promises');const handle=await open(canonical,'r');try{const b=Buffer.alloc(4);await handle.read(b,0,4,0);if(b.toString()!=='GGUF')throw new Error('The selected file has no GGUF header.');}finally{await handle.close();}
  }else if(process.platform==='win32'&&path.extname(canonical).toLowerCase()!=='.exe')throw new Error('Choose llama-server.exe.');
  return canonical;
}

export class Providers {
  private host?:ChildProcess;
  private connection?:LlamaConnection;
  private signature='';
  private starting?:Promise<void>;
  private stopping?:Promise<void>;
  private version?:string;
  private contextTokens?:number;
  private gpuLayers?:number;
  private logs='';
  private externalKey='';
  private idle?:ReturnType<typeof setTimeout>;
  private users=0;
  private lastError='';
  constructor(private readonly dataDir:string, private readonly hostPath=path.join(__dirname,'llama-host.cjs')){}
  validateModel(settings:Settings,name:unknown){return providerKind(settings)==='ollama'?ollama.validateModel(name):validateLlamaModel(name);}
  setExternalKey(value:string){if(typeof value!=='string'||value.length>2000||/[\r\n\0]/.test(value))throw new Error('Invalid session API key.');this.externalKey=value;}
  resetExternalKey(){this.externalKey='';}
  private endpoint(settings:Settings):LlamaConnection {
    const config=llamaConfig(settings);
    if(config.mode==='external')return {url:config.url,...(this.externalKey?{key:this.externalKey}:{})};
    if(!this.connection||!this.host)throw new Error('Load the GGUF model to inspect its running server.');return this.connection;
  }
  async listModels(settings:Settings):Promise<ModelInfo[]> {
    if(providerKind(settings)==='ollama')return ollama.listModels(settings.ollamaUrl);
    const config=llamaConfig(settings);if(config.mode==='external')return llamaModels(this.endpoint(settings));
    return config.modelPath?[{name:LLAMA_MODEL,size:(await stat(config.modelPath)).size}]:[];
  }
  async inspect(settings:Settings,name:string,signal?:AbortSignal):Promise<ModelDetails>{
    this.validateModel(settings,name);if(providerKind(settings)==='ollama')return ollama.inspectModel(settings.ollamaUrl,name,signal);
    if(llamaConfig(settings).mode==='managed'&&!this.host){if(name!==LLAMA_MODEL)throw new Error('Select the configured GGUF model.');const file=llamaConfig(settings).modelPath;if(file)await validateLlamaFile(file,'modelPath');return {name,local:Boolean(file),thinking:false,tools:false,ready:false,lifecycle:true};}
    const result=await llamaMetadata(this.endpoint(settings),name,signal);return {...result.details,lifecycle:llamaConfig(settings).mode==='managed',...(llamaConfig(settings).mode==='managed'?{runtimeVersion:this.version,source:llamaConfig(settings).modelPath}:{})};
  }
  async loaded(settings:Settings){
    if(providerKind(settings)==='ollama')return ollama.listLoadedModels(settings.ollamaUrl);
    if(llamaConfig(settings).mode==='managed'&&!this.host)return [];
    return (await llamaMetadata(this.endpoint(settings),settings.model)).loaded;
  }
  async status(settings:Settings):Promise<LlamaStatus>{
    const config=llamaConfig(settings);const configured=Boolean(config.executable&&config.modelPath);
    return {running:Boolean(this.host&&this.connection),owned:Boolean(this.host),configured,...(this.contextTokens?{contextTokens:this.contextTokens}:{}),...(this.gpuLayers!==undefined?{gpuLayers:this.gpuLayers}:{}),...(this.version?{version:this.version}:{}),message:this.host?'JaxOS owns this llama.cpp process.':this.lastError||'No JaxOS-managed llama.cpp process is running.'};
  }
  async load(settings:Settings,profile:InferenceProfile,signal:AbortSignal){
    if(providerKind(settings)==='ollama')return ollama.setModelResidency(settings.ollamaUrl,settings.model,profile,true,signal);
    if(llamaConfig(settings).mode!=='managed')throw new Error('Loading belongs to the attached server. Use managed GGUF mode for JaxOS lifecycle controls.');
    if(this.idle){clearTimeout(this.idle);this.idle=undefined;}
    if(this.starting)return this.starting;
    const job=this.startManaged(settings,profile,signal);this.starting=job;try{await job;}finally{this.starting=undefined;}
  }
  private async startManaged(settings:Settings,profile:InferenceProfile,signal:AbortSignal){
    const config=llamaConfig(settings);if(!config.executable||!config.modelPath)throw new Error('Choose llama-server and a GGUF model in Settings.');
    const executable=await validateLlamaFile(config.executable,'executable');const model=await validateLlamaFile(config.modelPath,'modelPath');
    if(settings.model!==LLAMA_MODEL)throw new Error('Select the configured GGUF model.');
    const layers=profile.gpu==='cpu'?0:config.gpuLayers;const signature=JSON.stringify({executable,model,context:profile.contextTokens,layers,threads:config.threads});
    if(this.host&&this.signature===signature)return;
    await this.stop();if(signal.aborted)throw new Error('Model load cancelled.');
    const probe=await promisify(execFile)(executable,['--version'],{timeout:10000,maxBuffer:32000,windowsHide:true,signal});
    const version=(probe.stdout+'\n'+probe.stderr).trim();if(!/version|llama/i.test(version))throw new Error('The selected executable did not identify its llama.cpp version.');
    this.version=version.slice(0,500);
    const port=await freePort();await mkdir(path.join(this.dataDir,'llama-runtime'),{recursive:true,mode:0o700});
    const directory=await mkdtemp(path.join(this.dataDir,'llama-runtime','owned-'));const key=randomBytes(32).toString('hex');const keyFile=path.join(directory,'api-key');await writeFile(keyFile,key+'\n',{mode:0o600,flag:'wx'});
    const args=['--model',model,'--alias',LLAMA_MODEL,'--host','127.0.0.1','--port',String(port),'--ctx-size',String(profile.contextTokens),'--parallel','1','--threads',String(config.threads),'--n-gpu-layers',layers===-1?'auto':String(layers),'--jinja','--reasoning-format','deepseek','--api-key-file',keyFile];
    const hostOptions: import('node:child_process').ForkOptions & {windowsHide:boolean}={windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe','ipc']};
    let host:ChildProcess;try{host=fork(this.hostPath,[JSON.stringify({executable,args,directory})],hostOptions);}catch(error){await rm(directory,{recursive:true,force:true});throw error;}
    this.host=host;this.logs='';this.lastError='';this.signature=signature;this.connection={url:`http://127.0.0.1:${port}`,key};
    host.on('message',(message:any)=>{if(message?.type==='log')this.logs=(this.logs+message.text).slice(-16000);if(message?.type==='error')this.lastError=String(message.message).slice(0,1000);});
    host.on('error',error=>{this.lastError=error.message;if(this.host===host&&!host.pid){this.host=undefined;this.connection=undefined;void rm(directory,{recursive:true,force:true}).catch(()=>{});}});
    host.once('exit',()=>{if(this.host===host){this.host=undefined;this.connection=undefined;this.contextTokens=undefined;this.gpuLayers=undefined;this.lastError=this.lastError||'The managed llama.cpp process stopped.';}void rm(directory,{recursive:true,force:true}).catch(()=>{});});
    try{
      const deadline=Date.now()+120000;
      for(;;){
        if(signal.aborted)throw new Error('Model load cancelled.');if(this.host!==host||host.exitCode!==null)throw new Error(this.lastError||this.logs.slice(-1500)||'llama.cpp exited while loading.');
        try{const health=await llamaJson(this.connection!,'/health',undefined,signal);if(health.status==='ok')break;}catch(error){if(signal.aborted)throw error;if(Date.now()>deadline)throw new Error('llama.cpp did not become ready within 120 seconds. '+this.logs.slice(-1000));}
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      const metadata=await llamaMetadata(this.connection!,LLAMA_MODEL,signal);if(!metadata.details.local||metadata.details.effectiveContext!==profile.contextTokens)throw new Error('llama.cpp did not report the requested local model/context.');
      this.contextTokens=metadata.details.effectiveContext;this.gpuLayers=layers;
    }catch(error){await this.stop();throw error;}
  }
  async prepare(settings:Settings,profile:InferenceProfile,signal:AbortSignal){
    if(providerKind(settings)==='llamacpp'&&llamaConfig(settings).mode==='managed')await this.load(settings,profile,signal);
    if(this.idle){clearTimeout(this.idle);this.idle=undefined;}this.users++;
  }
  release(settings:Settings,profile:InferenceProfile){
    this.users=Math.max(0,this.users-1);
    this.scheduleIdle(settings,profile);
  }
  scheduleIdle(settings:Settings,profile:InferenceProfile){
    if(this.idle){clearTimeout(this.idle);this.idle=undefined;}
    if(providerKind(settings)!=='llamacpp'||llamaConfig(settings).mode!=='managed'||this.users||profile.keepAliveSeconds<0)return;
    this.idle=setTimeout(()=>{this.idle=undefined;void this.stop();},profile.keepAliveSeconds*1000);this.idle.unref();
  }
  async generate(settings:Settings,input:GenerationInput):Promise<GenerationResult>{return providerKind(settings)==='ollama'?ollama.streamChat(input):llamaStream(input,this.endpoint(settings));}
  async unload(settings:Settings,profile:InferenceProfile,signal:AbortSignal){
    if(providerKind(settings)==='ollama')return ollama.setModelResidency(settings.ollamaUrl,settings.model,profile,false,signal);
    if(llamaConfig(settings).mode!=='managed')throw new Error('JaxOS does not stop an attached server.');await this.stop();
  }
  async pull(settings:Settings,name:string,signal:AbortSignal,progress:(status:string,completed?:number,total?:number)=>void){if(providerKind(settings)!=='ollama')throw new Error('Select a downloaded GGUF file for llama.cpp. Model downloads remain available through Ollama.');return ollama.pullModel(settings.ollamaUrl,name,signal,progress);}
  async stop(){
    if(this.idle){clearTimeout(this.idle);this.idle=undefined;}
    if(this.stopping)return this.stopping;
    const host=this.host;if(!host||host.exitCode!==null||host.signalCode!==null)return;
    const job=new Promise<void>(resolve=>{host.once('exit',()=>resolve());if(host.connected)host.send({type:'stop'},()=>{});else host.kill('SIGTERM');});
    this.stopping=job;try{await job;}finally{this.stopping=undefined;}
  }
}
