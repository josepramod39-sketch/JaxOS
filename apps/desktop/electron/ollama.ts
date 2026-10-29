import type { GenerationUsage, InferenceProfile, LoadedModel, ModelDetails, ModelInfo } from '../shared/types';
import { DEFAULT_PROFILE } from '../shared/model-profile';
import { randomUUID } from 'node:crypto';
import type { GenerationInput, GenerationResult } from './inference-contract';
import type { ToolCall } from '../shared/types';

export type ChatInput = GenerationInput;

export function validateOllamaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Enter a local Ollama URL.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid Ollama URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Ollama must use a localhost address without credentials, a path, or query parameters.');
  }
  return url.origin;
}

export function validateModel(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)) {
    throw new Error('Select a valid installed model name.');
  }
  return value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Ollama request failed.';
}

async function ensureResponse(response: Response): Promise<void> {
  if (!response.ok) {
    // Do not consume an unbounded server response just to report a status.
    await response.body?.cancel();
    throw new Error(`Ollama returned HTTP ${response.status}. Check that the selected model is installed.`);
  }
}

export async function listModels(url: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  const endpoint = validateOllamaUrl(url);
  const response = await fetch(`${endpoint}/api/tags`, {
    redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  });
  await ensureResponse(response);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Ollama returned an empty model list.');
  let body = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (body.length > 1_000_000) throw new Error('Ollama model list is too large.');
    }
    body += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const data = JSON.parse(body);
  if (!data || !Array.isArray(data.models)) throw new Error('Ollama returned an invalid model list.');
  return data.models.slice(0, 200).map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Ollama returned an invalid model entry.');
    const model = entry as { name?: unknown; size?: unknown };
    const name = validateModel(model.name);
    const raw = entry as Record<string, unknown>;
    return { name, ...(typeof model.size === 'number' && Number.isFinite(model.size) && model.size >= 0 ? { size: model.size } : {}), ...(raw.remote_model || raw.remote_host || name.endsWith(':cloud') ? { remote: true } : {}) };
  });
}

export async function streamChat(input: ChatInput): Promise<GenerationResult> {
  const endpoint = validateOllamaUrl(input.url);
  const model = validateModel(input.model);
  const timeout = AbortSignal.timeout(input.timeoutMs ?? 180_000);
  const signal = AbortSignal.any([input.signal, timeout]);
  const profile = input.profile ?? DEFAULT_PROFILE;
  let finishReason = 'stop';
  const usage: GenerationUsage = {};
  const toolCalls: ToolCall[] = [];
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: input.messages.map(({toolCalls,toolCallId,name,...item})=>({...item,...(toolCalls?{tool_calls:toolCalls.map(call=>({id:call.id,type:'function',function:{name:call.name,arguments:call.arguments}}))}:{}),...(toolCallId?{tool_call_id:toolCallId}:{}),...(name?{tool_name:name}:{})})), stream: true,
        ...(input.tools?.length ? {tools:input.tools}:{}),
        ...(profile.thinking === 'auto' ? {} : { think: profile.thinking === 'on' }),
        keep_alive: profile.keepAliveSeconds,
        options: { num_ctx: profile.contextTokens, num_predict: profile.outputTokens, temperature: profile.temperature, ...(profile.gpu === 'cpu' ? { num_gpu: 0 } : {}) } }),
    });
    await ensureResponse(response);
    reader = response.body?.getReader();
    if (!reader) throw new Error('Ollama returned an empty response.');
    const decoder = new TextDecoder();
    let buffer = '';
    let complete = false;
    let totalBytes = 0;
    let outputLength = 0;
    const consume = (line: string) => {
      if (!line.trim()) return;
      let item: Record<string, unknown>;
      try { item = JSON.parse(line); } catch { throw new Error('Ollama returned invalid streaming data.'); }
      if (!item || typeof item !== 'object') throw new Error('Ollama returned invalid streaming data.');
      if (typeof item.error === 'string') throw new Error(item.error.slice(0, 500));
      const calls = (item.message as any)?.tool_calls;
      if(calls!==undefined){
        if(!Array.isArray(calls)||toolCalls.length+calls.length>8)throw new Error('Invalid model tool calls.');
        for(const call of calls){const fn=call?.function;if(!fn||typeof fn.name!=='string'||!/^[a-z_]{1,80}$/.test(fn.name)||!fn.arguments||typeof fn.arguments!=='object'||Array.isArray(fn.arguments)||JSON.stringify(fn.arguments).length>20000)throw new Error('Invalid model tool arguments.');toolCalls.push({id:randomUUID(),name:fn.name,arguments:fn.arguments});}
      }
      const chunk = (item.message as { content?: unknown } | undefined)?.content;
      if (chunk !== undefined && typeof chunk !== 'string') throw new Error('Ollama returned invalid message content.');
      if (typeof chunk === 'string' && chunk) {
        outputLength += chunk.length;
        if (outputLength > 100_000) throw new Error('Response exceeded the 100,000-character limit.');
        input.onToken(chunk);
      }
      const reasoning = (item.message as { thinking?: unknown } | undefined)?.thinking;
      if (reasoning !== undefined && typeof reasoning !== 'string') throw new Error('Ollama returned invalid reasoning content.');
      if (typeof reasoning === 'string' && reasoning) {
        outputLength += reasoning.length;
        if (outputLength > 100_000) throw new Error('Response exceeded the 100,000-character limit.');
        input.onReasoning?.(reasoning);
      }
      if (item.done === true) {
        complete = true;
        if (typeof item.done_reason === 'string') finishReason = item.done_reason.slice(0, 100);
        const metrics = [['prompt_eval_count', 'inputTokens', 1], ['eval_count', 'outputTokens', 1], ['load_duration', 'loadMs', 1e6], ['eval_duration', 'generationMs', 1e6]] as const;
        for (const [field, target, divisor] of metrics) {
          const value = item[field];
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) usage[target] = value / divisor;
        }
      }
    };
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) { buffer += decoder.decode(); if (buffer.trim()) consume(buffer); break; }
      totalBytes += value.byteLength;
      if (totalBytes > 4_000_000) throw new Error('Ollama response exceeded the streaming size limit.');
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new Error('Ollama returned an oversized streaming record.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consume(line);
        if (complete) break;
      }
    }
    if (!complete) throw new Error('Ollama disconnected before completing its response.');
    return { usage, finishReason, ...(toolCalls.length?{toolCalls}:{}) };
  } catch (error) {
    if (input.signal.aborted) throw new Error('Response cancelled.');
    if (timeout.aborted) throw new Error('Ollama timed out. Try a smaller model or send a shorter message.');
    throw new Error(message(error));
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

async function jsonRequest(url: string, endpoint: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  const response = await fetch(`${validateOllamaUrl(url)}${endpoint}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(endpoint === '/api/generate' ? 180_000 : 15_000)]) });
  await ensureResponse(response);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Ollama returned an empty response.');
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2_000_000) throw new Error('Ollama metadata exceeded its size limit.'); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Ollama returned invalid metadata.');
  if (typeof result.error === 'string') throw new Error(result.error.slice(0, 500));
  return result;
}

export async function inspectModel(url: string, name: string, signal?: AbortSignal): Promise<ModelDetails> {
  validateModel(name);
  const data = await jsonRequest(url, '/api/show', { model: name }, signal);
  const info = data.model_info && typeof data.model_info === 'object' ? data.model_info : {};
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
  const contexts = Object.entries(info).filter(([key, value]) => key.endsWith('.context_length') && typeof value === 'number' && Number.isSafeInteger(value) && value > 0).map(([, value]) => value as number);
  const local = !(data.remote_model || data.remote_host || name.endsWith(':cloud')) && Boolean(data.details?.format || Object.keys(info).length);
  return { name, local, thinking: capabilities.includes('thinking'), tools: capabilities.includes('tools'),
    ...(contexts.length ? { maxContext: Math.max(...contexts) } : {}),
    ...(typeof data.details?.parameter_size === 'string' ? { parameterSize: data.details.parameter_size.slice(0, 100) } : {}),
    ...(typeof data.details?.quantization_level === 'string' ? { quantization: data.details.quantization_level.slice(0, 100) } : {}) };
}

export async function listLoadedModels(url: string, signal?: AbortSignal): Promise<LoadedModel[]> {
  const data = await jsonRequest(url, '/api/ps', undefined, signal);
  if (!Array.isArray(data.models) || data.models.length > 200) throw new Error('Ollama returned an invalid running-model list.');
  return data.models.map((item: any) => {
    const name = validateModel(item.name);
    if (![item.size, item.size_vram].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('Invalid model memory information.');
    return { name, size: item.size, vram: item.size_vram,
      ...(Number.isSafeInteger(item.context_length) && item.context_length > 0 ? { contextTokens: item.context_length } : {}),
      ...(typeof item.expires_at === 'string' ? { expiresAt: item.expires_at.slice(0, 100) } : {}) };
  });
}

export async function setModelResidency(url: string, name: string, profile: InferenceProfile, load: boolean, signal: AbortSignal) {
  validateModel(name);
  const result = await jsonRequest(url, '/api/generate', { model: name, stream: false, keep_alive: load ? profile.keepAliveSeconds : 0,
    ...(load ? { options: { num_ctx: profile.contextTokens, ...(profile.gpu === 'cpu' ? { num_gpu: 0 } : {}) } } : {}) }, signal);
  if (result.done !== true) throw new Error('Ollama did not acknowledge the model operation.');
  const loaded = await listLoadedModels(url, signal);
  const resident = loaded.some(model => model.name === name);
  if (load && !resident) throw new Error('The runtime does not report the model as loaded. Choose a nonzero keep-alive before preloading.');
  if (!load && resident) throw new Error('The runtime still reports this model as loaded. Another client may be using it; refresh its status.');
}

export async function pullModel(url: string, name: string, signal: AbortSignal, progress: (status: string, completed?: number, total?: number) => void) {
  validateModel(name);
  const response = await fetch(`${validateOllamaUrl(url)}/api/pull`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, stream: true }), signal: AbortSignal.any([signal, AbortSignal.timeout(2 * 60 * 60 * 1000)]) });
  await ensureResponse(response);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Ollama returned no download progress.');
  let buffer = ''; let done = false;
  const decoder = new TextDecoder();
  function consume(line: string) {
    if (!line.trim()) return;
    const record = JSON.parse(line);
    if (typeof record.error === 'string') throw new Error(record.error.slice(0, 500));
    if (typeof record.status !== 'string') throw new Error('Invalid model download progress.');
    const size = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    progress(record.status.slice(0, 300), size(record.completed), size(record.total));
    if (record.status === 'success') done = true;
  }
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) { buffer += decoder.decode(); if (buffer.trim()) consume(buffer); break; }
      buffer += decoder.decode(part.value, { stream: true });
      if (buffer.length > 1_000_000) throw new Error('Download progress record exceeded its size limit.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
    }
    if (!done) throw new Error('Download disconnected before completion. Refresh installed models before retrying.');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
