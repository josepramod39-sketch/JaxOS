import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { appendFileSync } from 'node:fs';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AppService } from '../electron/service';
import { WorkspaceStore } from '../electron/store';
import type { Run } from '../shared/types';

const directories: string[] = [];
const services: AppService[] = [];
const servers: http.Server[] = [];
async function directory() { const result = await mkdtemp(path.join(os.tmpdir(), 'jaxos-service-')); directories.push(result); return result; }
async function app(dataDir = '') { const service = new AppService(dataDir || await directory()); await service.init(); services.push(service); return service; }
async function endpoint(handler: http.RequestListener) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/show') { req.resume(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ details: { format: 'gguf' }, model_info: { 'test.context_length': 40960 }, capabilities: ['completion', 'thinking'] })); return; }
    handler(req, res);
  }); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Timed out waiting for state.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.shutdown()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map(item => rm(item, { recursive: true, force: true })));
});

describe('assistant workspace service', () => {
  it('persists project briefs, daily work, selection and model settings across restart', async () => {
    const dataDir = await directory(); const service = await app(dataDir);
    const projectDir = await directory();
    await writeFile(path.join(projectDir, 'device.kicad_pro'), '{}');
    await writeFile(path.join(projectDir, 'device.kicad_sch'), '(kicad_sch)');
    const project = await service.importProject(path.join(projectDir, 'device.kicad_pro'));
    await service.updateProject(project.id, { goal: 'A measured prototype', notes: 'Use the saved schematic.', checks: ['Check supply voltage'] });
    const conversation = await service.createConversation(project.id);
    await service.addDailyItem('Review ERC findings');
    const dailyId = service.getState().dailyItems[0].id;
    await service.toggleDailyItem(dailyId);
    await service.setMode('test');
    await service.saveSettings({ model: 'qwen3:0.6b', ollamaUrl: 'http://localhost:11434/' });
    await service.shutdown();
    const restored = await app(dataDir);
    expect(restored.getState()).toMatchObject({ mode: 'test', activeProjectId: project.id, activeConversationId: conversation.id,
      projects: [{ goal: 'A measured prototype', notes: 'Use the saved schematic.', checks: ['Check supply voltage'] }],
      dailyItems: [{ id: dailyId, done: true }], settings: { model: 'qwen3:0.6b', ollamaUrl: 'http://localhost:11434' } });
    const copy = restored.getState(); copy.projects[0].goal = 'external mutation';
    expect(restored.getProject(project.id).goal).toBe('A measured prototype');
  });

  it('keeps distinct project files in one folder separate and refreshes only the reimported identity', async () => {
    const projectDir = await directory();
    for (const name of ['alpha', 'beta']) {
      await writeFile(path.join(projectDir, `${name}.kicad_pro`), '{}');
      await writeFile(path.join(projectDir, `${name}.kicad_sch`), '(kicad_sch)');
    }
    const service = await app();
    const alpha = await service.importProject(path.join(projectDir, 'alpha.kicad_pro'));
    await service.updateProject(alpha.id, { goal: 'Alpha goal' });
    const beta = await service.importProject(path.join(projectDir, 'beta.kicad_pro'));
    expect(beta.id).not.toBe(alpha.id);
    expect(beta.projectFile).toBe(path.join(projectDir, 'beta.kicad_pro'));
    expect(beta.schematic).toBe(path.join(projectDir, 'beta.kicad_sch'));
    await service.updateProject(beta.id, { goal: 'Beta goal' });
    const refreshed = await service.importProject(path.join(projectDir, 'beta.kicad_pro'));
    expect(refreshed.id).toBe(beta.id);
    expect(refreshed.goal).toBe('Beta goal');
    expect(service.getProject(alpha.id).goal).toBe('Alpha goal');
    expect(service.getState().projects).toHaveLength(2);
    expect(service.getState().activeProjectId).toBe(beta.id);

    const filelessDir = await directory();
    await writeFile(path.join(filelessDir, 'standalone.kicad_pcb'), '(kicad_pcb)');
    const fileless = await service.importProject(filelessDir);
    expect((await service.importProject(filelessDir)).id).toBe(fileless.id);
    expect(service.getState().projects).toHaveLength(3);
  });

  it('streams an actual HTTP response, persists it, and prevents duplicate in-flight sends', async () => {
    let release: (() => void) | undefined;
    let body = '';
    const url = await endpoint((req, res) => {
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        res.write(`${JSON.stringify({ message: { content: 'Start' }, done: false })}\n`);
        release = () => res.end(`${JSON.stringify({ message: { content: ' here.' }, done: true })}\n`);
      });
    });
    const service = await app(); await service.saveSettings({ ollamaUrl: url });
    const id = service.getState().activeConversationId!;
    let notifications = 0;
    const unsubscribe = service.subscribe(() => { notifications++; });
    await service.sendMessage({ conversationId: id, text: 'Plan a project' });
    await until(() => Boolean(release));
    await expect(service.sendMessage({ conversationId: id, text: 'Duplicate' })).rejects.toThrow(/Wait/);
    release!();
    await until(() => service.getState().conversations[0].messages.at(-1)?.status === 'complete');
    expect(service.getState().conversations[0].messages.at(-1)?.content).toBe('Start here.');
    expect(JSON.parse(body).messages[0].content).toContain('You have no tools');
    expect(notifications).toBeGreaterThan(1); unsubscribe();
    await service.shutdown();
    const restored = await app(service.dataDir);
    expect(restored.getState().conversations[0].messages.at(-1)).toMatchObject({ content: 'Start here.', status: 'complete' });
  });

  it('keeps visible project selection and model context aligned without rebinding existing history', async () => {
    const prompts: string[] = [];
    const url = await endpoint((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { prompts.push(JSON.parse(body).messages[0].content); res.end(`${JSON.stringify({ message: { content: 'Ready.' }, done: true })}\n`); });
    });
    const service = await app(); await service.saveSettings({ ollamaUrl: url });
    const initialId = service.getState().activeConversationId!;
    const firstDir = await directory(); await writeFile(path.join(firstDir, 'first.kicad_sch'), '(kicad_sch)');
    const first = await service.importProject(firstDir);
    expect(service.getState().activeConversationId).toBe(initialId);
    await service.updateProject(first.id, { goal: 'First supply', notes: 'Use a 3.3 V regulator.' });
    await service.sendMessage({ conversationId: initialId, text: 'Help with this project' });
    await until(() => service.getState().conversations.find(item => item.id === initialId)?.messages.at(-1)?.status === 'complete');
    expect(prompts[0]).toContain('First supply'); expect(prompts[0]).toContain('3.3 V regulator');
    const secondDir = await directory(); await writeFile(path.join(secondDir, 'second.kicad_sch'), '(kicad_sch)');
    const second = await service.importProject(secondDir);
    const secondId = service.getState().activeConversationId!;
    expect(secondId).not.toBe(initialId);
    expect(service.getState().conversations.find(item => item.id === initialId)?.projectId).toBe(first.id);
    await service.updateProject(second.id, { goal: 'Second sensor', notes: 'Read temperature.' });
    await service.sendMessage({ conversationId: secondId, text: 'Help with this project' });
    await until(() => service.getState().conversations.find(item => item.id === secondId)?.messages.at(-1)?.status === 'complete');
    expect(prompts[1]).toContain('Second sensor'); expect(prompts[1]).not.toContain('First supply');
    await service.selectProject(first.id);
    expect(service.getState().activeConversationId).toBe(initialId);
    const unbound = await service.createConversation();
    expect(service.getState().activeProjectId).toBeUndefined();
    await service.selectProject(second.id); await service.selectConversation(unbound.id);
    expect(service.getState().activeProjectId).toBeUndefined();
    expect(service.getState().mode).toBe('brainstorm');
  });

  it('records cancellation and model failure honestly without marking a partial answer complete', async () => {
    const url = await endpoint((_req, res) => { res.write(`${JSON.stringify({ message: { content: 'Partial response' }, done: false })}\n`); });
    const service = await app(); await service.saveSettings({ ollamaUrl: url });
    const id = service.getState().activeConversationId!;
    await service.sendMessage({ conversationId: id, text: 'Begin' });
    await until(() => service.getState().conversations[0].messages.at(-1)?.content === 'Partial response');
    await service.cancelChat(id);
    await until(() => service.getState().conversations[0].messages.at(-1)?.status === 'cancelled');
    const failureUrl = await endpoint((_req, res) => res.end(`${JSON.stringify({ error: 'model missing' })}\n`));
    await service.saveSettings({ ollamaUrl: failureUrl });
    await service.sendMessage({ conversationId: id, text: 'Try again' });
    await until(() => service.getState().conversations[0].messages.at(-1)?.status === 'error');
    expect(service.getState().conversations[0].messages.at(-1)?.content).toContain('model missing');
  });

  it('rejects invalid fields, unknown IDs, network destinations and unbounded messages before mutation', async () => {
    const service = await app(); const baseline = service.getState();
    await expect(service.selectConversation('../private')).rejects.toThrow(/Invalid/);
    await expect(service.selectProject('missing')).rejects.toThrow(/not found/);
    await expect(service.saveSettings({ ollamaUrl: 'https://external.example' })).rejects.toThrow(/localhost/);
    await expect(service.saveSettings({ kicadPath: '/tmp/program' } as never)).rejects.toThrow(/fields/);
    await expect(service.sendMessage({ conversationId: baseline.activeConversationId!, text: 'x'.repeat(20_001) })).rejects.toThrow();
    await expect(service.setMode('untrusted' as never)).rejects.toThrow();
    expect(service.getState()).toEqual(baseline);
  });

  it('marks persisted incomplete work interrupted after a crash', async () => {
    const dataDir = await directory(); const store = new WorkspaceStore(dataDir); const state = await store.load();
    const date = new Date().toISOString();
    state.projects.push({ id: 'project', name: 'Device', path: dataDir, fingerprint: 'abc', goal: '', notes: '', checks: [], connectedAt: date, refreshedAt: date });
    state.conversations.push({ id: 'conversation', title: 'Earlier work', createdAt: date, updatedAt: date, messages: [{ id: 'answer', role: 'assistant', content: 'Partial', createdAt: date, status: 'streaming' }] });
    state.runs.push({ id: 'run', projectId: 'project', kind: 'erc', status: 'running', createdAt: date, inputFingerprint: 'abc', stale: false, toolVersion: '9', command: [], exitCode: null, summary: 'Running', log: '', findings: [], artifacts: [] });
    await store.save(state);
    const service = await app(dataDir);
    expect(service.getState().conversations[0].messages[0]).toMatchObject({ status: 'error', content: expect.stringContaining('Interrupted') });
    expect(service.getRun('run')).toMatchObject({ status: 'error', exitCode: null, summary: expect.stringContaining('Interrupted') });
    expect(service.getState().notice).toContain('not counted as passed');
  });

  it('invalidates earlier evidence on the next run and catches changes made during the new check', async () => {
    const projectDir = await directory();
    await cp(fileURLToPath(new URL('./fixtures/kicad/clean/', import.meta.url)), projectDir, { recursive: true });
    const service = await app();
    const status = await service.getKiCadStatus();
    expect(status.available, status.error).toBe(true);
    const project = await service.importProject(projectDir);
    const first = await service.startRun({ projectId: project.id, kind: 'erc' });
    await until(() => service.getRun(first.id).status === 'passed');
    expect(service.getRun(first.id).stale).toBe(false);
    await appendFile(project.schematic!, '\n');
    let earlierInvalidated = false;
    let changedDuringCheck = false;
    const stop = service.subscribe(state => {
      const next = state.runs.find(run => run.id !== first.id);
      if (next?.status === 'running' && state.runs.find(run => run.id === first.id)?.stale) earlierInvalidated = true;
      if (next?.command.some(arg => arg.endsWith('.kicad_sch')) && !changedDuringCheck) {
        changedDuringCheck = true;
        appendFileSync(project.schematic!, '\n');
      }
    });
    const second = await service.startRun({ projectId: project.id, kind: 'erc' });
    await until(() => service.getRun(second.id).status === 'passed' && service.getRun(second.id).stale &&
      service.getProject(project.id).fingerprint !== service.getRun(second.id).inputFingerprint);
    stop();
    expect(earlierInvalidated).toBe(true);
    expect(changedDuringCheck).toBe(true);
    expect(service.getRun(first.id).stale).toBe(true);
    expect(service.getRun(second.id).stale).toBe(true);
    expect(service.getProject(project.id).fingerprint).not.toBe(service.getRun(second.id).inputFingerprint);
  }, 20_000);

  it.each(['board', 'directory'] as const)('persists stale evidence when refresh fails after deleting the project %s', async removed => {
    const dataDir = await directory();
    const projectDir = await directory();
    await cp(fileURLToPath(new URL('./fixtures/kicad/clean/', import.meta.url)), projectDir, { recursive: true });
    await rm(path.join(projectDir, 'two-pin-link.kicad_sch'));
    let service = await app(dataDir);
    const project = await service.importProject(path.join(projectDir, 'two-pin-link.kicad_pro'));
    const run = await service.startRun({ projectId: project.id, kind: 'drc' });
    await until(() => service.getRun(run.id).status === 'passed');
    // Wait for final evidence persistence before changing source files, so only refresh can invalidate it.
    await service.shutdown();
    service = await app(dataDir);
    expect(service.getRun(run.id)).toMatchObject({ status: 'passed', stale: false });
    if (removed === 'board') {
      await rm(project.board!);
      await expect(service.refreshProject(project.id)).rejects.toThrow(/No matching KiCad schematic or PCB/);
    } else {
      await rm(projectDir, { recursive: true });
      await expect(service.refreshProject(project.id)).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(service.getRun(run.id)).toMatchObject({ status: 'passed', stale: true });
    await service.shutdown();
    const restored = await app(dataDir);
    expect(restored.getRun(run.id)).toMatchObject({ status: 'passed', stale: true });
  }, 20_000);

  it('confines previews to owned regular files in the requested run, including symlink escapes', async () => {
    const dataDir = await directory(); const external = await directory();
    const store = new WorkspaceStore(dataDir); const state = await store.load();
    const date = new Date().toISOString();
    state.projects.push({ id: 'project', name: 'Device', path: external, fingerprint: 'abc', goal: '', notes: '', checks: [], connectedAt: date, refreshedAt: date });
    await mkdir(path.join(dataDir, 'runs', 'owned'), { recursive: true });
    const inside = path.join(dataDir, 'runs', 'owned', 'report.json');
    const outside = path.join(external, 'secret.txt');
    await writeFile(inside, '{"violations":[]}'); await writeFile(outside, 'private');
    const link = path.join(dataDir, 'runs', 'owned', 'escape.txt');
    await symlink(outside, link);
    const run: Run = { id: 'owned', projectId: 'project', kind: 'erc', status: 'passed', createdAt: date, inputFingerprint: 'abc', stale: false, toolVersion: '9', command: [], exitCode: 0, summary: 'Rule check only', log: '', findings: [], artifacts: [
      { id: 'report', name: 'report.json', path: inside, mime: 'text/html', bytes: 17 },
      { id: 'outside', name: 'secret.txt', path: outside, mime: 'text/plain', bytes: 7 },
      { id: 'link', name: 'escape.txt', path: link, mime: 'text/plain', bytes: 7 },
    ] };
    state.runs.push(run); await store.save(state);
    const service = await app(dataDir);
    expect(await service.readArtifact({ runId: 'owned', artifactId: 'report' })).toEqual({ mime: 'application/json', encoding: 'utf8', content: '{"violations":[]}' });
    await expect(service.readArtifact({ runId: 'owned', artifactId: 'outside' })).rejects.toThrow(/outside/);
    await expect(service.readArtifact({ runId: 'owned', artifactId: 'link' })).rejects.toThrow(/outside/);
    await expect(service.readArtifact({ runId: 'other', artifactId: 'report' })).rejects.toThrow(/not found/);
    await expect(service.readArtifact({ runId: 'owned', artifactId: '../report' })).rejects.toThrow(/Invalid/);
    expect(await readFile(outside, 'utf8')).toBe('private');
  });
});
