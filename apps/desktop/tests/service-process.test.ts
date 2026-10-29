import { fork, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ServiceClient } from '../electron/service-client';
import type { ServiceMessage } from '../shared/service-contract';

let root: string;
const directories: string[] = [];
const clients: ServiceClient[] = [];
const servers: http.Server[] = [];
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'jaxos-process-build-'));
  await build({ entryPoints: [path.resolve('electron/service-host.ts')], outfile: path.join(root, 'host.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
});
afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map(client => client.stop()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
async function directory() { const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-process-')); directories.push(dir); return dir; }
function client(dataDir: string) {
  let child: ChildProcess;
  const connection = new ServiceClient(() => {
    child = fork(path.join(root, 'host.cjs'), [dataDir], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    return { send: request => { child.send(request); }, onMessage: listener => { child.on('message', listener); }, onExit: listener => { child.on('exit', listener); }, kill: () => { child.kill(); } };
  }, 5000);
  clients.push(connection);
  return { connection, child: () => child! };
}
async function until(check: () => boolean) { const start = Date.now(); while (!check()) { if (Date.now() - start > 8000) throw new Error('Service process condition timed out.'); await new Promise(resolve => setTimeout(resolve, 15)); } }

describe('actual isolated coordinator process', () => {
  it('persists state across a clean process replacement through the private protocol', async () => {
    const dir = await directory(); const { connection, child } = client(dir);
    await connection.start(); expect(child().pid).not.toBe(process.pid);
    await connection.remote.addDailyItem('Persisted outside Electron');
    const id = (await connection.remote.getState()).dailyItems[0].id;
    await connection.remote.toggleDailyItem(id);
    const firstPid = child().pid;
    const state = await connection.restart();
    expect(child().pid).not.toBe(firstPid);
    expect(state.dailyItems).toMatchObject([{ text: 'Persisted outside Electron', done: true }]);
    const saved = new DatabaseSync(path.join(dir,'workspace.sqlite'), {readOnly:true});
    try { expect(saved.prepare('SELECT data FROM daily_items').all().map(row=>JSON.parse(String(row.data)))).toEqual(state.dailyItems); } finally { saved.close(); }
  });

  it('rejects unknown methods and prevents a second writer from opening the workspace', async () => {
    const dir = await directory(); const first = client(dir); await first.connection.start();
    const result = new Promise<ServiceMessage>(resolve => first.child().on('message', data => { const message = data as ServiceMessage; if (message.type === 'result' && message.id === 'probe') resolve(message); }));
    first.child().send({ protocol: 1, id: 'probe', method: '__proto__', args: [] });
    expect(await result).toMatchObject({ type: 'result', error: 'Unknown service method.' });
    const second = client(dir);
    await expect(second.connection.start()).rejects.toThrow(/already using/);
    await first.connection.remote.addDailyItem('The original writer remains usable');
    expect((await first.connection.remote.getState()).dailyItems).toHaveLength(1);
  });

  it('recovers an interrupted real HTTP stream after a crash without replaying inference', async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      req.resume();
      if (req.url === '/api/show') { res.end(JSON.stringify({ details: { format: 'gguf' }, capabilities: ['completion'] })); return; }
      requests++; res.write(`${JSON.stringify({ message: { content: 'Partial persisted answer' }, done: false })}\n`);
    }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const dir = await directory(); const { connection, child } = client(dir); await connection.start();
    await connection.remote.saveSettings({ ollamaUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    const id = (await connection.remote.getState()).activeConversationId!;
    let received = false;
    connection.subscribe(state => { if (state.conversations[0].messages.at(-1)?.content.includes('Partial')) received = true; });
    const request = { conversationId: id, text: 'Begin', commandId: 'recover-once' };
    await connection.remote.sendMessage(request);
    await until(() => received);
    // Streaming state is flushed on a short debounce; ensure those bytes exist before the forced crash.
    const deadline = Date.now() + 5000;
    for (;;) {
      const saved = new DatabaseSync(path.join(dir,'workspace.sqlite'),{readOnly:true});
      let persisted=false;
      try { persisted=Boolean(saved.prepare("SELECT content FROM messages WHERE role='assistant'").all().some(row=>String(row.content).includes('Partial'))); } finally { saved.close(); }
      if (persisted) break;
      if (Date.now() > deadline) throw new Error('Streaming state was not persisted.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    child().kill('SIGKILL'); await until(() => !connection.getStatus().connected);
    const state = await connection.remote.getState();
    expect(state.conversations[0].messages.at(-1)?.status).toBe('error');
    expect(state.notice).toMatch(/interrupted/i);
    await connection.remote.sendMessage(request);
    expect(requests).toBe(1);
    expect((await connection.remote.listTasks()).some(task=>task.status==='interrupted')).toBe(true);
    expect(state.conversations[0].messages.at(-1)?.content).toContain('Interrupted');
  });
});
