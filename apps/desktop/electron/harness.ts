import type { InferenceProfile, ToolCall, ToolStep, WorkflowStage } from '../shared/types';
import type { GenerationInput, GenerationResult, InferenceMessage, ToolDefinition } from './inference-contract';

export const STAGE_RUNS = {
  analysis: [], plan: [], design: ['preview'], test: ['erc', 'drc'], launch: ['fabrication'],
} as const;
export const STAGE_GUIDANCE: Record<WorkflowStage, string> = {
  analysis: 'Identify the problem, constraints and unknowns. Cite available evidence.',
  plan: 'Compare options and propose ordered steps with concrete acceptance checks.',
  design: 'Explain design decisions and implementation proposals. Saved-file previews are available when offered; source editing is not.',
  test: 'Use offered checks when the user requests verification. Distinguish rule checks, simulation and physical measurements.',
  launch: 'Prepare a local checked handoff when requested. Fabrication generation includes deterministic checks; it does not order, deploy or physically test anything.',
};
export function stageTools(stage: WorkflowStage): ToolDefinition[] {
  const tools: ToolDefinition[] = [{ type:'function',function:{name:'project_inspect',description:'Inspect the attached KiCad project and recent recorded results. Refreshes saved-file fingerprints.',parameters:{type:'object',properties:{},additionalProperties:false}} }];
  if(STAGE_RUNS[stage].length)tools.push({type:'function',function:{name:'project_run',description:'Run a saved-file KiCad operation for the attached project and wait for its actual result. Fabrication generates files only after checks.',parameters:{type:'object',properties:{kind:{type:'string',enum:STAGE_RUNS[stage]}},required:['kind'],additionalProperties:false}}});
  return tools;
}
export function validateStageCall(stage:WorkflowStage, call:ToolCall) {
  if(!call.arguments || typeof call.arguments!=='object' || Array.isArray(call.arguments))throw new Error('Tool arguments must be an object.');
  const keys=Object.keys(call.arguments);
  if(call.name==='project_inspect' && !keys.length)return;
  if(call.name==='project_run' && keys.length===1 && keys[0]==='kind' && (STAGE_RUNS[stage] as readonly string[]).includes(call.arguments.kind as string))return;
  throw new Error(`Tool or arguments are not permitted in the ${stage} stage.`);
}
export class HarnessLimitError extends Error {}
export function toolContextCost(tools:ToolDefinition[]){return tools.length ? Buffer.byteLength(JSON.stringify(tools),'utf8')+128 : 0;}

interface HarnessInput {
  messages:InferenceMessage[]; profile:InferenceProfile; stage:WorkflowStage; tools:ToolDefinition[];
  signal:AbortSignal; steps:ToolStep[]; persist:()=>Promise<void>;
  generate:(input:Pick<GenerationInput,'messages'|'profile'|'signal'|'tools'|'onToken'|'onReasoning'>)=>Promise<GenerationResult>;
  execute:(call:ToolCall,step:ToolStep,signal:AbortSignal)=>Promise<string>;
  onToken:(text:string)=>void; onReasoning:(text:string)=>void;
  timeoutMs?:number;
}
/** Bounded sequential loop. Only completed, schema-checked calls can reach a worker. */
export async function runHarness(input:HarnessInput):Promise<GenerationResult> {
  const deadline=AbortSignal.timeout(input.timeoutMs??300000);
  const signal=AbortSignal.any([input.signal,deadline]);
  const messages=structuredClone(input.messages); const ids=new Set<string>();
  const usage:GenerationResult['usage']={}; let remaining=input.profile.outputTokens*4; let output=0;
  try {
    for(let turn=0;turn<7;turn++) {
      signal.throwIfAborted();
      if(remaining<128)throw new HarnessLimitError('The task reached its generation budget. Review its results before continuing.');
      const profile={...input.profile,outputTokens:Math.min(input.profile.outputTokens,remaining)};
      const cost=messages.reduce((total,m)=>total+Buffer.byteLength(JSON.stringify(m),'utf8')+32,0)+toolContextCost(input.tools);
      if(cost+profile.outputTokens+128>profile.contextTokens)throw new HarnessLimitError('The task filled its context budget. Its tool results are saved; increase context or start a shorter follow-up.');
      let content='';
      const append=(text:string,reasoning=false)=>{output+=text.length;if(output>100000)throw new HarnessLimitError('The task reached its output size limit.');if(reasoning)input.onReasoning(text);else{content+=text;input.onToken(text);}};
      const result=await input.generate({messages,profile,signal,...(input.tools.length?{tools:input.tools}:{}),onToken:text=>append(text),onReasoning:text=>append(text,true)});
      signal.throwIfAborted();
      remaining-=result.usage.outputTokens??profile.outputTokens;
      for(const [key,value] of Object.entries(result.usage))if(value!==undefined)usage[key as keyof typeof usage]=(usage[key as keyof typeof usage]??0)+value;
      if(!result.toolCalls?.length)return {...result,usage};
      if(!input.tools.length)throw new Error('This request did not grant model tools. No operation was executed.');
      if(!['stop','tool_calls'].includes(result.finishReason))throw new Error('The model did not complete its tool request normally. No operation was executed.');
      if(input.steps.length+result.toolCalls.length>6)throw new HarnessLimitError('The task reached its six-operation budget. Review the saved results before continuing.');
      messages.push({role:'assistant',content,toolCalls:result.toolCalls});
      for(const call of result.toolCalls){
        signal.throwIfAborted();
        if(ids.has(call.id))throw new Error('The model repeated a tool-call ID. No duplicate operation was executed.');
        ids.add(call.id);
        const step:ToolStep={...call,status:'running',startedAt:new Date().toISOString()};
        input.steps.push(step);
        // Admission must be durable before executing even a refresh operation.
        await input.persist();
        try{validateStageCall(input.stage,call);signal.throwIfAborted();step.result=(await input.execute(call,step,signal)).slice(0,6000);step.status='complete';}
        catch(error){step.result=(error instanceof Error?error.message:'Tool execution failed.').slice(0,2000);step.status=signal.aborted?'interrupted':'error';}
        step.finishedAt=new Date().toISOString();await input.persist();
        signal.throwIfAborted();
        messages.push({role:'tool',name:call.name,toolCallId:call.id,content:step.result??''});
      }
      if(content)input.onToken('\n\n');
    }
    throw new HarnessLimitError('The task reached its turn budget.');
  }catch(error){if(deadline.aborted&&!input.signal.aborted)throw new HarnessLimitError('The task reached its five-minute deadline. Completed tool results remain saved.');throw error;}
}
