import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Providers, validateLlamaFile } from '../electron/providers';
import { validateModel, validateOllamaUrl } from '../electron/ollama';
import { DEFAULT_PROFILE, validateProfile } from '../shared/model-profile';
import { DEFAULT_LLAMA, LLAMA_MODEL, validateLlamaConfig } from '../shared/provider-settings';
import type { InferenceProfile, Settings } from '../shared/types';

export interface EvaluationModelInput {
  provider?: string; model?: string; url?: string; executable?: string; modelPath?: string;
  gpuLayers?: number; threads?: number; contextTokens?: number; outputTokens?: number; thinking?: string;
}
export interface EvaluationModelOptions {
  provider: 'ollama' | 'llamacpp'; model: string; url: string;
  executable?: string; modelPath?: string; gpuLayers: number; threads: number; profile: InferenceProfile;
}

/** Normalize before executing or contacting any server; attached llama servers remain a desktop feature. */
export function normalizeModelOptions(input: EvaluationModelInput = {}): EvaluationModelOptions {
  if (input.provider !== undefined && !['ollama', 'llama.cpp', 'llamacpp'].includes(input.provider)) throw new Error('Provider must be ollama or llama.cpp.');
  const provider = input.provider === 'llama.cpp' || input.provider === 'llamacpp' ? 'llamacpp' : 'ollama';
  const profile = validateProfile({ ...DEFAULT_PROFILE, contextTokens: input.contextTokens ?? 4096, outputTokens: input.outputTokens ?? 256,
    temperature: 0, thinking: input.thinking ?? 'off', keepAliveSeconds: provider === 'llamacpp' ? -1 : DEFAULT_PROFILE.keepAliveSeconds, gpu: input.gpuLayers === 0 ? 'cpu' : 'auto' });
  const config = validateLlamaConfig({ ...DEFAULT_LLAMA, gpuLayers: input.gpuLayers ?? 0, threads: input.threads ?? 4 });
  if (provider === 'ollama') {
    if (input.executable !== undefined || input.modelPath !== undefined || input.gpuLayers !== undefined || input.threads !== undefined) throw new Error('Executable, GGUF, GPU layers and threads apply only to the llama.cpp provider.');
    return { provider, model: validateModel(input.model ?? 'qwen3:0.6b'), url: validateOllamaUrl(input.url ?? 'http://127.0.0.1:11434'), gpuLayers: config.gpuLayers, threads: config.threads, profile };
  }
  if (input.url !== undefined) throw new Error('Managed llama.cpp chooses a private loopback port; do not pass --url.');
  if (input.model !== undefined && input.model !== LLAMA_MODEL) throw new Error(`Managed llama.cpp uses the model alias ${LLAMA_MODEL}; select weights with the GGUF path.`);
  for (const [label, file] of [['llama-server executable', input.executable], ['GGUF model', input.modelPath]]) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) throw new Error(`Specify an absolute local ${label} path.`);
  }
  return { provider, model: LLAMA_MODEL, url: DEFAULT_LLAMA.url, executable: input.executable, modelPath: input.modelPath, gpuLayers: config.gpuLayers, threads: config.threads, profile };
}

export function evaluationSettings(options: EvaluationModelOptions): Settings {
  return { provider: options.provider, model: options.model, ollamaUrl: options.provider === 'ollama' ? options.url : 'http://127.0.0.1:11434', kicadPath: '',
    ...(options.provider === 'llamacpp' ? { llama: { ...DEFAULT_LLAMA, executable: options.executable, modelPath: options.modelPath, gpuLayers: options.gpuLayers, threads: options.threads } } : {}) };
}

async function identity(file: string, kind: 'executable' | 'modelPath') {
  const canonical = await validateLlamaFile(file, kind); const before = await stat(canonical); const hash = createHash('sha256');
  for await (const chunk of createReadStream(canonical)) hash.update(chunk);
  const after = await stat(canonical);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Model/runtime file changed while hashing; retry with unchanged files.');
  return { path: canonical, bytes: after.size, sha256: hash.digest('hex') };
}

export function createEvaluationModel(root: string, options: EvaluationModelOptions, hostPath = process.env.JAXOS_EVAL_LLAMA_HOST) {
  if (options.provider === 'llamacpp' && (!hostPath || !path.isAbsolute(hostPath))) throw new Error('The bundled llama.cpp supervisor is unavailable.');
  const providers = new Providers(root, hostPath); const settings = evaluationSettings(options); const profile = options.profile;
  const signal = () => AbortSignal.timeout(180000);
  async function generate(prompt: string) {
    try {
      const deadline = signal(); await providers.prepare(settings, profile, deadline);
      let text = '', reasoning = '';
      const result = await providers.generate(settings, { url: settings.ollamaUrl, model: options.model, messages: [{ role: 'user', content: prompt }],
        profile, signal: deadline, onToken: token => { text += token; }, onReasoning: token => { reasoning += token; } });
      return { text, reasoning, ...result };
    } finally { providers.release(settings, profile); await providers.stop(); }
  }
  return {
    options, settings, profile, generate,
    async inspect() {
      try {
        const files = options.provider === 'llamacpp' ? { executable: await identity(options.executable!, 'executable'), model: await identity(options.modelPath!, 'modelPath') } : undefined;
        if (options.provider === 'llamacpp') await providers.load(settings, profile, signal());
        const details = await providers.inspect(settings, options.model, signal());
        if (!details.local) throw new Error('Selected model is not verified local.');
        if (details.maxContext && profile.contextTokens > details.maxContext) throw new Error('The requested context exceeds the model maximum.');
        if (profile.thinking === 'on' && !details.thinking) throw new Error('The selected model does not advertise thinking support.');
        const status = options.provider === 'llamacpp' ? await providers.status(settings) : undefined;
        return { details, ...(files ? { files } : {}), ...(status ? { runtime: { version: status.version, contextTokens: status.contextTokens, requestedGpuLayers: options.gpuLayers, threads: options.threads } } : {}) };
      } finally { await providers.stop(); }
    },
    async lifecycle() {
      if (options.provider !== 'llamacpp') throw new Error('Managed lifecycle evaluation requires llama.cpp; Ollama residency is shared with other clients.');
      try {
        await providers.load(settings, profile, signal());
        const loaded = await providers.status(settings); const metadata = await providers.inspect(settings, options.model, signal());
        const controller = new AbortController(); let partial = '', rejected = false;
        const token = (text: string) => { partial += text; if (text) controller.abort(); };
        try {
          await providers.generate(settings, { url: settings.ollamaUrl, model: options.model, messages: [{ role: 'user', content: 'Write the numbers from one to one hundred, one per line.' }],
            profile, signal: AbortSignal.any([controller.signal, signal()]), onToken: token, onReasoning: token });
        } catch (error) { if (!controller.signal.aborted) throw error; rejected = true; }
        let recoveryText = '', recoveryReasoning = '';
        const recovery = await providers.generate(settings, { url: settings.ollamaUrl, model: options.model, messages: [{ role: 'user', content: 'Say ready.' }],
          profile, signal: signal(), onToken: text => { recoveryText += text; }, onReasoning: text => { recoveryReasoning += text; } });
        await providers.unload(settings, profile, signal());
        const unloaded = await providers.status(settings); const remainingModels = await providers.loaded(settings);
        const pass = loaded.running && loaded.owned && metadata.effectiveContext === profile.contextTokens && partial.length > 0 && controller.signal.aborted && rejected &&
          (recoveryText.length > 0 || recoveryReasoning.length > 0) && !unloaded.running && !unloaded.owned && remainingModels.length === 0;
        return { pass, observed: { requestedContext: profile.contextTokens, effectiveContext: metadata.effectiveContext, loaded: { running: loaded.running, owned: loaded.owned },
          cancellation: { partialCharacters: partial.length, aborted: controller.signal.aborted, rejected }, recovery: { text: recoveryText, reasoning: recoveryReasoning, ...recovery },
          unloaded: { running: unloaded.running, owned: unloaded.owned, remainingModels: remainingModels.length }, runtimeVersion: loaded.version } };
      } finally { await providers.stop(); }
    },
    stop: () => providers.stop(),
  };
}
