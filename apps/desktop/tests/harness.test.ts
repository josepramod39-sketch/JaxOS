import { describe, expect, it, vi } from 'vitest';
import { runHarness, stageTools, validateStageCall } from '../electron/harness';
import { DEFAULT_PROFILE } from '../shared/model-profile';
import type { ToolCall, ToolStep } from '../shared/types';
import type { GenerationResult } from '../electron/inference-contract';

const call:ToolCall={id:'one',name:'project_run',arguments:{kind:'drc'}};
const request=()=>({messages:[{role:'user' as const,content:'Check the project'}],profile:{...DEFAULT_PROFILE,contextTokens:8192,outputTokens:512},stage:'test' as const,tools:stageTools('test'),signal:new AbortController().signal,steps:[] as ToolStep[],persist:vi.fn(async()=>{}),execute:vi.fn(async()=>'{"status":"failed","summary":"A real violation"}'),onToken:vi.fn(),onReasoning:vi.fn()});
describe('bounded stage tool harness',()=>{
  it('persists intent before execution and passes actual failed results into the next turn',async()=>{
    const input=request();const order:string[]=[];input.persist.mockImplementation(async()=>{order.push(input.steps[0]?.status??'none');});input.execute.mockImplementation(async()=>{order.push('executed');return '{"status":"failed","summary":"A real violation"}';});
    let turns=0;
    const result=await runHarness({...input,generate:async req=>{if(++turns===1)return {usage:{outputTokens:7},finishReason:'tool_calls',toolCalls:[call]};expect(req.messages.at(-1)).toMatchObject({role:'tool',toolCallId:'one',content:expect.stringContaining('failed')});req.onToken('The check failed.');return {usage:{outputTokens:4},finishReason:'stop'};}});
    expect(order).toEqual(['running','executed','complete']);expect(input.steps[0].status).toBe('complete');expect(input.steps[0].result).toContain('failed');expect(result.usage.outputTokens).toBe(11);
  });
  it('does not execute before durable admission succeeds',async()=>{
    const input=request();input.persist.mockRejectedValue(new Error('Disk full'));
    await expect(runHarness({...input,generate:async()=>({usage:{},finishReason:'tool_calls',toolCalls:[call]})})).rejects.toThrow(/Disk full/);expect(input.execute).not.toHaveBeenCalled();
  });
  it.each(['analysis','plan','design','launch'] as const)('rejects a DRC call in %s and prevents extra path arguments',stage=>{
    expect(()=>validateStageCall(stage,call)).toThrow(/not permitted/);
    expect(()=>validateStageCall('test',{...call,arguments:{kind:'drc',path:'/outside'}})).toThrow(/not permitted/);
  });
  it('records a rejected call as an error without touching the worker',async()=>{
    const input=request();let turns=0;
    await runHarness({...input,generate:async()=>++turns===1?{usage:{outputTokens:1},finishReason:'tool_calls',toolCalls:[{...call,name:'exec'}]}:{usage:{},finishReason:'stop'}});
    expect(input.execute).not.toHaveBeenCalled();expect(input.steps[0]).toMatchObject({status:'error',result:expect.stringContaining('not permitted')});
  });
  it('stops repeated call IDs, excessive calls and truncated requests without duplicate execution',async()=>{
    const input=request();const generate=async():Promise<GenerationResult>=>({usage:{outputTokens:1},finishReason:'tool_calls',toolCalls:[call]});
    await expect(runHarness({...input,generate})).rejects.toThrow(/repeated/);expect(input.execute).toHaveBeenCalledTimes(1);
    const oversized=request();await expect(runHarness({...oversized,generate:async()=>({usage:{},finishReason:'tool_calls',toolCalls:Array.from({length:7},(_,i)=>({...call,id:String(i)}))})})).rejects.toThrow(/six-operation/);expect(oversized.execute).not.toHaveBeenCalled();
    const truncated=request();await expect(runHarness({...truncated,generate:async()=>({usage:{},finishReason:'length',toolCalls:[call]})})).rejects.toThrow(/normally/);expect(truncated.execute).not.toHaveBeenCalled();
  });
  it('enforces context and time budgets and propagates cancellation to the running operation',async()=>{
    const small=request();small.profile.contextTokens=1024;small.messages[0].content='x'.repeat(2000);const generate=vi.fn(async()=>({usage:{},finishReason:'stop'}));await expect(runHarness({...small,generate})).rejects.toThrow(/context budget/);expect(generate).not.toHaveBeenCalled();
    const timed=request();await expect(runHarness({...timed,timeoutMs:20,generate:async req=>new Promise((_,reject)=>req.signal.addEventListener('abort',()=>reject(new Error('Aborted'))))})).rejects.toThrow(/deadline/);
    const cancelled=request();const controller=new AbortController();cancelled.execute.mockImplementation(async(_call?:unknown,_step?:unknown,signal?:AbortSignal)=>{controller.abort();signal?.throwIfAborted();return '';});
    await expect(runHarness({...cancelled,signal:controller.signal,generate:async()=>({usage:{},finishReason:'tool_calls',toolCalls:[call]})})).rejects.toThrow();expect(cancelled.steps[0].status).toBe('interrupted');
  });
});
