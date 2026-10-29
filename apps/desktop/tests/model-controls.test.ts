import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppService } from '../electron/service';
import { assembleContext } from '../electron/context';
import { inspectModel, pullModel, setModelResidency, streamChat } from '../electron/ollama';
import { DEFAULT_PROFILE, getModelProfile } from '../shared/model-profile';
import { WorkspaceStore } from '../electron/store';
import { SqliteWorkspaceStore } from '../electron/sqlite-store';
import type { Message } from '../shared/types';

const servers: http.Server[] = []; const services: AppService[] = []; const directories: string[] = [];
async function endpoint(handler: http.RequestListener) {
  const server = http.createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function app() { const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-models-')); directories.push(dir); const service = new AppService(dir); services.push(service); await service.init(); return service; }
async function until(check: () => boolean) { const deadline = Date.now() + 5000; while (!check()) { if (Date.now() > deadline) throw new Error('Timed out.'); await new Promise(resolve => setTimeout(resolve, 10)); } }
const metadata = { details: { format: 'gguf', parameter_size: '0.6B' }, capabilities: ['completion', 'thinking'], model_info: { 'qwen3.context_length': 40960 } };
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.shutdown()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('local model controls and context', () => {
  it('keeps reasoning separate, forwards the profile and records final usage and truncation', async () => {
    let body: any;
    const url = await endpoint((req, res) => { let text = ''; req.on('data', part => { text += part; }); req.on('end', () => { body = JSON.parse(text); res.end([
      { message: { thinking: 'Check assumptions.' }, done: false },
      { message: { content: 'Measure first.' }, done: false },
      { message: {}, done: true, done_reason: 'length', prompt_eval_count: 17, eval_count: 12, load_duration: 2000000, eval_duration: 6000000 },
    ].map(item => JSON.stringify(item)).join('\n')); }); });
    let text = '', reasoning = '';
    const result = await streamChat({ url, model: 'qwen3:0.6b', messages: [{ role: 'user', content: 'Check' }], signal: new AbortController().signal,
      profile: { ...DEFAULT_PROFILE, contextTokens: 4096, outputTokens: 256, thinking: 'on', gpu: 'cpu', keepAliveSeconds: 60 }, onToken: part => { text += part; }, onReasoning: part => { reasoning += part; } });
    expect(text).toBe('Measure first.'); expect(reasoning).toBe('Check assumptions.');
    expect(result).toEqual({ finishReason: 'length', usage: { inputTokens: 17, outputTokens: 12, loadMs: 2, generationMs: 6 } });
    expect(body).toMatchObject({ think: true, keep_alive: 60, options: { num_ctx: 4096, num_predict: 256, num_gpu: 0 } });
  });

  it('detects remote routes and verifies actual residency instead of trusting an acknowledgement', async () => {
    let resident = false, refuseUnload = false;
    const url = await endpoint((req, res) => {
      let body = ''; req.on('data', part => { body += part; }); req.on('end', () => {
        if (req.url === '/api/show') return res.end(JSON.stringify({ ...metadata, remote_host: 'https://remote.example' }));
        if (req.url === '/api/ps') return res.end(JSON.stringify({ models: resident ? [{ name: 'qwen3:0.6b', size: 1000, size_vram: 500, context_length: 8192 }] : [] }));
        const request = JSON.parse(body); if (request.keep_alive !== 0) resident = true; else if (!refuseUnload) resident = false;
        res.end(JSON.stringify({ done: true }));
      });
    });
    expect((await inspectModel(url, 'qwen3:0.6b')).local).toBe(false);
    await setModelResidency(url, 'qwen3:0.6b', DEFAULT_PROFILE, true, new AbortController().signal);
    refuseUnload = true;
    await expect(setModelResidency(url, 'qwen3:0.6b', DEFAULT_PROFILE, false, new AbortController().signal)).rejects.toThrow(/still reports/);
    refuseUnload = false; await setModelResidency(url, 'qwen3:0.6b', DEFAULT_PROFILE, false, new AbortController().signal);
    expect(resident).toBe(false);
  });

  it('requires terminal download success and honors request cancellation', async () => {
    const truncated = await endpoint((_req, res) => res.end(`${JSON.stringify({ status: 'pulling', completed: 5, total: 10 })}\n`));
    await expect(pullModel(truncated, 'qwen3:0.6b', new AbortController().signal, () => {})).rejects.toThrow(/before completion/);
    const controller = new AbortController();
    const stalled = await endpoint((_req, res) => res.write(`${JSON.stringify({ status: 'pulling', completed: 5, total: 10 })}\n`));
    await expect(pullModel(stalled, 'qwen3:0.6b', controller.signal, () => controller.abort())).rejects.toThrow();
  });

  it('saves bounded per-model profiles, queues generation and preserves reasoning after restart', async () => {
    const requests: any[] = []; let release: (() => void) | undefined;
    const url = await endpoint((req, res) => {
      let body = ''; req.on('data', part => { body += part; }); req.on('end', () => {
        if (req.url === '/api/show') return res.end(JSON.stringify(metadata));
        requests.push(JSON.parse(body));
        const finish = () => res.end([JSON.stringify({ message: { thinking: 'Reasoned separately.', content: 'Ready.' }, done: false }), JSON.stringify({ done: true, done_reason: 'stop', eval_count: 3 })].join('\n'));
        if (requests.length === 1) { res.write('\n'); release = finish; } else finish();
      });
    });
    const service = await app(); await service.saveSettings({ ollamaUrl: url });
    await expect(service.saveModelProfile({ model: 'qwen3:0.6b', profile: { ...DEFAULT_PROFILE, contextTokens: 65536 } })).rejects.toThrow(/maximum context/);
    const profile = { ...DEFAULT_PROFILE, contextTokens: 4096, outputTokens: 512, thinking: 'on' as const };
    await service.saveModelProfile({ model: 'qwen3:0.6b', profile });
    const first = service.getState().activeConversationId!; const second = await service.createConversation();
    await service.sendMessage({ conversationId: first, text: 'First' }); await until(() => Boolean(release));
    await service.sendMessage({ conversationId: second.id, text: 'Second' });
    expect(service.getState().conversations.find(item => item.id === second.id)?.messages.at(-1)?.phase).toBe('queued');
    expect(requests).toHaveLength(1); release!();
    await until(() => service.getState().conversations.every(item => item.messages.at(-1)?.status === 'complete'));
    expect(requests).toHaveLength(2); expect(requests[0]).toMatchObject({ think: true, options: { num_ctx: 4096, num_predict: 512 } });
    await service.shutdown();
    const restored = new AppService(service.dataDir); services.push(restored); await restored.init();
    expect(getModelProfile(restored.getState().settings)).toEqual(profile);
    expect(restored.getState().conversations[0].messages.at(-1)).toMatchObject({ reasoning: 'Reasoned separately.', content: 'Ready.', finishReason: 'stop', model: 'qwen3:0.6b' });
  });

  it('persists download outcomes and prevents competing lifecycle operations', async () => {
    let release: (() => void) | undefined;
    const url = await endpoint((req, res) => {
      req.resume(); res.write(`${JSON.stringify({ status: 'pulling weights', completed: 10, total: 20 })}\n`);
      release = () => res.end(`${JSON.stringify({ status: 'success' })}\n`);
    });
    const service = await app(); await service.saveSettings({ ollamaUrl: url });
    const first = await service.startModelOperation({ model: 'qwen3:0.6b', kind: 'pull' });
    await until(() => Boolean(release));
    expect(service.getState().modelOperations?.[0]).toMatchObject({ id: first.id, status: 'running', completed: 10, total: 20 });
    await expect(service.startModelOperation({ model: 'qwen3:0.6b', kind: 'pull' })).rejects.toThrow(/current model operation/);
    release!(); await until(() => service.getState().modelOperations?.[0]?.status === 'complete');
    const second = await service.startModelOperation({ model: 'qwen3:0.6b', kind: 'pull' });
    await until(() => service.getState().modelOperations?.[0]?.completed === 10);
    await service.cancelModelOperation(second.id);
    await until(() => service.getState().modelOperations?.[0]?.status === 'cancelled');
    expect(service.getState().modelOperations?.[0]?.summary).toMatch(/shared downloads/);
  });

  it('binds a saved profile to the endpoint that supplied its capabilities during a connection change', async () => {
    let release: (() => void) | undefined;
    const firstUrl = await endpoint((req, res) => { req.resume(); release = () => res.end(JSON.stringify(metadata)); });
    const secondUrl = await endpoint((req, res) => { req.resume(); res.end(JSON.stringify(metadata)); });
    const service = await app(); await service.saveSettings({ ollamaUrl: firstUrl });
    const saving = service.saveModelProfile({ model: 'qwen3:0.6b', profile: { ...DEFAULT_PROFILE, contextTokens: 4096 } });
    await until(() => Boolean(release));
    await service.saveSettings({ ollamaUrl: secondUrl }); release!(); await saving;
    const state = service.getState();
    expect(getModelProfile({ ...state.settings, ollamaUrl: firstUrl }).contextTokens).toBe(4096);
    expect(getModelProfile(state.settings).contextTokens).toBe(DEFAULT_PROFILE.contextTokens);
  });

  it('preserves an older workspace and marks abandoned model jobs interrupted on startup', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-legacy-models-')); directories.push(dir);
    const store = new WorkspaceStore(dir); const legacy = await store.load();
    legacy.dailyItems.push({ id: 'keep', text: 'Keep my existing work', done: false, createdAt: new Date().toISOString() });
    delete legacy.settings.modelProfiles; delete legacy.modelOperations;
    await store.save(legacy);
    const restored = new AppService(dir); services.push(restored); await restored.init();
    expect(restored.getState().dailyItems[0].text).toBe('Keep my existing work');
    expect(getModelProfile(restored.getState().settings)).toEqual(DEFAULT_PROFILE);
    await restored.shutdown();
    const nextStore = new SqliteWorkspaceStore(dir); const state = await nextStore.load();
    state.modelOperations = [{ id: 'interrupted-load', model: 'qwen3:0.6b', kind: 'load', status: 'running', createdAt: new Date().toISOString(), summary: 'Loading' }];
    await nextStore.save(state); await nextStore.close();
    const recovered = new AppService(dir); services.push(recovered); await recovered.init();
    expect(recovered.getState().modelOperations?.[0]).toMatchObject({ status: 'error', summary: expect.stringMatching(/Interrupted/) });
  });

  it('keeps complete exchanges within the conservative context budget and rejects an oversized latest prompt', () => {
    const message = (role: Message['role'], content: string): Message => ({ id: String(Math.random()), role, content, status: 'complete', createdAt: new Date().toISOString() });
    const history = [message('user', 'Old '.repeat(100)), message('assistant', 'Earlier '.repeat(100)), message('user', 'Latest question')];
    const result = assembleContext('Instructions', history, { ...DEFAULT_PROFILE, contextTokens: 1024, outputTokens: 256 });
    expect(result.omitted).toBe(2); expect(result.messages.map(item => item.content)).toEqual(['Instructions', 'Latest question']);
    expect(() => assembleContext('Instructions', [message('user', 'x'.repeat(2000))], { ...DEFAULT_PROFILE, contextTokens: 1024, outputTokens: 256 })).toThrow(/latest message/);
  });
});
