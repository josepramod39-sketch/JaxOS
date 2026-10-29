import { randomUUID } from 'node:crypto';
import type { GenerationInput, GenerationResult } from './inference-contract';
import type { ModelDetails, ModelInfo, LoadedModel, ToolCall } from '../shared/types';
import { DEFAULT_PROFILE } from '../shared/model-profile';

export interface LlamaConnection {url:string;key?:string;}
async function response(connection:LlamaConnection,route:string,body:unknown,signal?:AbortSignal,timeout=15000) {
  const result=await fetch(connection.url+route,{method:body===undefined?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json',...(connection.key?{Authorization:`Bearer ${connection.key}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(timeout)])});
  if(!result.ok){await result.body?.cancel();throw new Error(`llama.cpp returned HTTP ${result.status}.${result.status===401?' Check the session API key.':''}`);}
  return result;
}
export async function llamaJson(connection:LlamaConnection,route:string,body?:unknown,signal?:AbortSignal) {
  const result=await response(connection,route,body,signal);const reader=result.body?.getReader();if(!reader)throw new Error('llama.cpp returned an empty response.');
  let bytes=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000)throw new Error('llama.cpp metadata exceeded its limit.');chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid llama.cpp metadata.');return data as Record<string,any>;
}
export function validateLlamaModel(value:unknown):string {
  // Native model IDs may be GGUF filenames/paths. They are identifiers, never host paths to execute.
  if(typeof value!=='string'||!value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value))throw new Error('Select a valid llama.cpp model ID (up to 200 characters).');return value;
}
export async function llamaModels(connection:LlamaConnection,signal?:AbortSignal):Promise<ModelInfo[]> {
  const data=await llamaJson(connection,'/v1/models',undefined,signal);
  if(!Array.isArray(data.data)||data.data.length>200)throw new Error('Invalid llama.cpp model list.');
  return data.data.map((item:any)=>({name:validateLlamaModel(item.id),...(Number.isFinite(item.meta?.size)&&item.meta.size>=0?{size:item.meta.size}:{}),...(item.owned_by&&item.owned_by!=='llamacpp'?{remote:true}:{})}));
}
// Model file size is not resident RAM/VRAM; absent telemetry stays unknown.
export async function llamaMetadata(connection:LlamaConnection,name:string,signal?:AbortSignal):Promise<{details:ModelDetails;loaded:LoadedModel[]}> {
  validateLlamaModel(name);
  const data=await llamaJson(connection,'/v1/models',undefined,signal);if(!Array.isArray(data.data))throw new Error('Invalid llama.cpp models.');
  const model=data.data.find((item:any)=>item.id===name);if(!model)throw new Error('The selected llama.cpp model is not reported by this server.');
  const props=await llamaJson(connection,`/props?model=${encodeURIComponent(name)}`,undefined,signal);
  const local=model.owned_by==='llamacpp'&&typeof props.model_path==='string'&&Boolean(model.meta)&&!model.remote_host&&!model.remote_model;
  const caps=props.chat_template_caps??{};const template=typeof props.chat_template==='string'?props.chat_template:'';
  const context=props.default_generation_settings?.n_ctx??model.meta?.n_ctx;
  const effective=Number.isSafeInteger(context)&&context>0?context:undefined;
  const max=model.meta?.n_ctx_train;const active=!props.is_sleeping;
  return {details:{name,local,thinking:caps.supports_reasoning_effort===true||caps.supports_thinking===true||/\benable_thinking\b/.test(template),tools:caps.supports_tools===true||caps.supports_tool_calls===true,ready:active,lifecycle:false,...(effective?{effectiveContext:effective}:{}),...(Number.isSafeInteger(max)&&max>0?{maxContext:max}:{}),...(typeof model.meta?.ftype==='string'?{quantization:model.meta.ftype}:{}),...(Number.isFinite(model.meta?.n_params)?{parameterSize:`${(model.meta.n_params/1e9).toFixed(2)}B`}:{})},loaded:active?[{name,size:Number.isFinite(model.meta?.size)?model.meta.size:0,...(effective?{contextTokens:effective}:{})}]:[]};
}
export async function llamaStream(input:GenerationInput,connection:LlamaConnection):Promise<GenerationResult> {
  const profile=input.profile??DEFAULT_PROFILE;const messages=input.messages.map(m=>({role:m.role,content:m.content,...(m.toolCalls?{tool_calls:m.toolCalls.map(t=>({id:t.id,type:'function',function:{name:t.name,arguments:JSON.stringify(t.arguments)}}))}:{}),...(m.toolCallId?{tool_call_id:m.toolCallId}:{}),...(m.name?{name:m.name}:{})}));
  const result=await response(connection,'/v1/chat/completions',{model:input.model,messages,stream:true,stream_options:{include_usage:true},max_tokens:profile.outputTokens,temperature:profile.temperature,...(input.tools?.length?{tools:input.tools,tool_choice:'auto'}:{}),...(profile.thinking==='auto'?{}:{chat_template_kwargs:{enable_thinking:profile.thinking==='on'},...(profile.thinking==='off'?{reasoning_effort:'none'}:{})})},input.signal,input.timeoutMs??180000);
  const reader=result.body?.getReader();if(!reader)throw new Error('llama.cpp returned an empty stream.');
  let buffer='',record='',total=0,output=0,done=false,finished=false;let finishReason='stop';const usage:GenerationResult['usage']={};
  const calls=new Map<number,{id:string;name:string;arguments:string}>();const decoder=new TextDecoder();
  function event(data:string){
    if(data==='[DONE]'){done=true;return;}if(!data.trim())return;
    const item=JSON.parse(data);if(item.error)throw new Error(String(item.error.message??'llama.cpp generation failed.').slice(0,500));
    for(const choice of item.choices??[]){if(choice.index!==0)throw new Error('Multiple llama.cpp choices are not supported.');const delta=choice.delta??{};
      for(const [field,callback] of [['reasoning_content',input.onReasoning],['content',input.onToken]] as const){const text=delta[field];if(text!==undefined&&text!==null&&typeof text!=='string')throw new Error('Invalid llama.cpp stream text.');if(text){output+=text.length;if(output>100000)throw new Error('Response exceeded the 100,000-character limit.');callback?.(text);}}
      for(const tool of delta.tool_calls??[]){const index=tool.index;if(!Number.isInteger(index)||index<0||index>=8)throw new Error('Invalid tool-call index.');const current=calls.get(index)??{id:'',name:'',arguments:''};if(tool.id)current.id=String(tool.id);if(tool.function?.name)current.name+=tool.function.name;if(tool.function?.arguments)current.arguments+=tool.function.arguments;if(current.arguments.length>20000||current.name.length>100||current.id.length>200)throw new Error('Tool call exceeded its size limit.');calls.set(index,current);}
      if(typeof choice.finish_reason==='string'){finished=true;finishReason=choice.finish_reason.slice(0,100);}}
    if(item.usage){for(const [source,target] of [['prompt_tokens','inputTokens'],['completion_tokens','outputTokens']] as const){const n=item.usage[source];if(Number.isFinite(n)&&n>=0)usage[target]=n;}}
    if(Number.isFinite(item.timings?.predicted_ms)&&item.timings.predicted_ms>=0)usage.generationMs=item.timings.predicted_ms;
  }
  function line(value:string){if(value===''){if(record){event(record);record='';}}else if(value.startsWith('data:'))record+=(record?'\n':'')+value.slice(5).trimStart();}
  try{
    while(!done){const part=await reader.read();if(part.done){buffer+=decoder.decode();if(buffer)line(buffer.replace(/\r$/,''));line('');break;}total+=part.value.byteLength;if(total>4_000_000)throw new Error('llama.cpp stream exceeded its size limit.');buffer+=decoder.decode(part.value,{stream:true});if(buffer.length+record.length>1_000_000)throw new Error('Oversized llama.cpp event.');let newline:number;while((newline=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,newline).replace(/\r$/,'');buffer=buffer.slice(newline+1);line(text);if(done)break;}}
    if(!done||!finished)throw new Error('llama.cpp disconnected before completing its response.');
    const toolCalls:ToolCall[]=[...calls.values()].map(call=>{const args=JSON.parse(call.arguments||'{}');if(!/^[a-z][a-z0-9_]{0,63}$/.test(call.name)||!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid completed tool call.');return {id:call.id||randomUUID(),name:call.name,arguments:args};});
    return {usage,finishReason,...(toolCalls.length?{toolCalls}:{})};
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
