import type { GenerationUsage, InferenceProfile, ToolCall } from '../shared/types';
export interface InferenceMessage {role:'system'|'user'|'assistant'|'tool';content:string;toolCalls?:ToolCall[];toolCallId?:string;name?:string;}
export interface ToolDefinition {type:'function';function:{name:string;description:string;parameters:Record<string,unknown>};}
export interface GenerationInput {
  url:string;model:string;messages:InferenceMessage[];signal:AbortSignal;
  onToken:(text:string)=>void;onReasoning?:(text:string)=>void;profile?:InferenceProfile;timeoutMs?:number;tools?:ToolDefinition[];
}
export interface GenerationResult {usage:GenerationUsage;finishReason:string;toolCalls?:ToolCall[];}
