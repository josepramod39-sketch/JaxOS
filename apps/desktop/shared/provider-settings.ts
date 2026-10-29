import type { LlamaConfig, ProviderKind, Settings, WorkflowStage } from './types';

export const LLAMA_MODEL = 'jaxos-gguf';
export const DEFAULT_LLAMA: LlamaConfig = { mode:'managed',url:'http://127.0.0.1:8080',gpuLayers:-1,threads:4 };
export const providerKind=(settings:Settings):ProviderKind=>settings.provider??'ollama';
export const llamaConfig=(settings:Settings):LlamaConfig=>({...DEFAULT_LLAMA,...settings.llama});
export const providerAddress=(settings:Settings):string=>providerKind(settings)==='ollama'?settings.ollamaUrl:llamaConfig(settings).mode==='managed'?'managed':llamaConfig(settings).url;
export const STAGES:WorkflowStage[]=['analysis','plan','design','test','launch'];
export function validateLlamaConfig(value:unknown):LlamaConfig {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid llama.cpp configuration.');
  const c=value as Record<string,unknown>;
  if(Object.keys(c).some(k=>!['mode','url','executable','modelPath','gpuLayers','threads'].includes(k)))throw new Error('Unknown llama.cpp setting.');
  if(!['managed','external'].includes(c.mode as string))throw new Error('Choose managed GGUF or an attached server.');
  if(typeof c.url!=='string'||c.url.length>200)throw new Error('Enter a llama.cpp localhost URL.');
  let url:URL;try{url=new URL(c.url);}catch{throw new Error('Enter a valid llama.cpp URL.');}
  if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('llama.cpp must use a localhost address without credentials, a path or query parameters.');
  if(!Number.isInteger(c.gpuLayers)||Number(c.gpuLayers)<-1||Number(c.gpuLayers)>999)throw new Error('GPU layers must be -1 (Auto), 0 (CPU), or 1–999.');
  if(!Number.isInteger(c.threads)||Number(c.threads)<1||Number(c.threads)>256)throw new Error('CPU threads must be 1–256.');
  for(const key of ['executable','modelPath'])if(c[key]!==undefined&&(typeof c[key]!=='string'||String(c[key]).length>8192||String(c[key]).includes('\0')))throw new Error('Invalid llama.cpp file path.');
  return {...c,url:url.origin} as unknown as LlamaConfig;
}
