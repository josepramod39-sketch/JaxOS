import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultState, validateState, WorkspaceStore } from '../electron/store';

const directories: string[] = [];
async function workspace() { const directory = await mkdtemp(path.join(os.tmpdir(), 'jaxos-store-')); directories.push(directory); return directory; }
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('durable workspace', () => {
  it('serializes competing writes atomically and reloads the latest complete snapshot', async () => {
    const directory = await workspace();
    const store = new WorkspaceStore(directory);
    const state = await store.load();
    state.mode = 'build';
    const first = store.save(state);
    state.mode = 'test';
    const second = store.save(state);
    // Mutating the source after save does not change the queued snapshot.
    state.mode = 'daily';
    await Promise.all([first, second]);
    expect((await new WorkspaceStore(directory).load()).mode).toBe('test');
    expect(JSON.parse(await readFile(store.backupFile, 'utf8')).mode).toBe('build');
    expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('recovers a validated backup and preserves corrupt primary evidence', async () => {
    const directory = await workspace();
    const store = new WorkspaceStore(directory);
    const state = await store.load();
    state.mode = 'daily'; await store.save(state);
    state.mode = 'test'; await store.save(state);
    await writeFile(store.file, '{incomplete');
    const recovered = await new WorkspaceStore(directory).load();
    expect(recovered.mode).toBe('daily');
    expect(recovered.notice).toMatch(/Recovered/);
    const corrupt = (await readdir(directory)).find(file => file.includes('.corrupt-'))!;
    expect(await readFile(path.join(directory, corrupt), 'utf8')).toBe('{incomplete');
    expect(JSON.parse(await readFile(store.file, 'utf8')).mode).toBe('daily');
  });

  it('does not overwrite unrecoverable files or allow saving before a successful load', async () => {
    const directory = await workspace();
    const store = new WorkspaceStore(directory);
    await writeFile(store.file, 'not a workspace');
    await writeFile(store.backupFile, 'also invalid');
    await expect(store.load()).rejects.toThrow(/preserved/);
    await expect(store.save(defaultState())).rejects.toThrow(/load successfully/);
    expect(await readFile(store.file, 'utf8')).toBe('not a workspace');
    expect(await readFile(store.backupFile, 'utf8')).toBe('also invalid');
  });

  it('refuses a newly corrupted primary without replacing a good backup', async () => {
    const directory = await workspace(); const store = new WorkspaceStore(directory);
    const state = await store.load(); state.mode = 'build'; await store.save(state);
    const backup = await readFile(store.backupFile, 'utf8');
    await writeFile(store.file, 'external corruption');
    await expect(store.save(state)).rejects.toThrow();
    expect(await readFile(store.file, 'utf8')).toBe('external corruption');
    expect(await readFile(store.backupFile, 'utf8')).toBe(backup);
  });

  it('rejects schema, remote endpoint, duplicate identifiers and missing references', () => {
    expect(() => validateState({ ...defaultState(), schemaVersion: 99 })).toThrow(/version/);
    const remote = defaultState(); remote.settings.ollamaUrl = 'https://example.com';
    expect(() => validateState(remote)).toThrow(/localhost/);
    const duplicate = defaultState();
    duplicate.dailyItems = [0, 1].map(() => ({ id: 'same', text: 'A', done: false, createdAt: new Date().toISOString() }));
    expect(() => validateState(duplicate)).toThrow(/Duplicate/);
    expect(() => validateState({ ...defaultState(), activeConversationId: 'absent' })).toThrow(/missing/);
  });
});
