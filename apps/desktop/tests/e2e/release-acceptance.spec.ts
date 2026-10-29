import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DesktopHarness } from './harness';

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port allocated.');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}
async function stopOwnedServer(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

test('attached authenticated llama.cpp works through Settings and remains externally owned', async () => {
  test.skip(process.env.JAXOS_LIVE_LLAMA_TEST !== '1', 'Requires real llama-server and GGUF.');
  test.setTimeout(180000);
  const desktop = await DesktopHarness.create();
  let server: ChildProcess | undefined;
  try {
    const port = await availablePort();
    const endpoint = `http://127.0.0.1:${port}`;
    const key = randomBytes(32).toString('hex');
    const keyPath = path.join(desktop.temporaryRoot, 'external-server-key');
    await writeFile(keyPath, key + '\n', { mode: 0o600 });
    server = spawn(process.env.JAXOS_TEST_LLAMA_BIN!, [
      '--model', process.env.JAXOS_TEST_LLAMA_MODEL!, '--alias', 'acceptance-gguf',
      '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '4096',
      '--n-gpu-layers', '0', '--threads', '2', '--parallel', '1',
      '--jinja', '--reasoning-format', 'deepseek', '--api-key-file', keyPath,
    ], { stdio: 'ignore', shell: false, windowsHide: true });
    let startError = '';
    server.on('error', error => { startError = error.message; });
    const health = async () => {
      if (startError) throw new Error(startError);
      try { return (await fetch(endpoint + '/health', { signal: AbortSignal.timeout(2000) })).status; }
      catch { return 0; }
    };
    await expect.poll(health, { timeout: 120000 }).toBe(200);
    expect((await fetch(endpoint + '/v1/models')).status).toBe(401);

    const page = await desktop.launch();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Model runtime', exact: true }).selectOption('llamacpp');
    await page.getByRole('combobox', { name: 'llama.cpp connection', exact: true }).selectOption('external');
    await page.getByRole('textbox', { name: 'llama.cpp address', exact: true }).fill(endpoint);
    await page.getByRole('combobox', { name: 'Model name', exact: true }).fill('acceptance-gguf');
    await page.getByLabel('Session API key (optional)', { exact: true }).fill(key);
    await page.getByRole('button', { name: 'Save and connect', exact: true }).click();
    await expect(page.getByText('Connection saved. Choose a model reported by this runtime.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Loaded · .*4,096 effective context/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load model', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Unload model', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Session API key (optional)', { exact: true })).toHaveValue('');
    await page.locator('.settings-disclosure summary').first().click();
    await expect(page.getByRole('combobox', { name: 'Keep loaded', exact: true })).toBeDisabled();
    await expect(page.getByRole('spinbutton', { name: 'Context tokens', exact: true })).toHaveAttribute('max', '4096');
    await page.getByRole('spinbutton', { name: 'Context tokens', exact: true }).fill('4096');
    await page.getByRole('spinbutton', { name: 'Maximum output tokens', exact: true }).fill('256');
    await page.getByRole('button', { name: 'Save model profile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save model profile', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message JaxOS', exact: true }).fill('What is 2 plus 2? Answer briefly.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(async () => (await desktop.state()).conversations[0].messages.at(-1)?.status, { timeout: 60000 }).toBe('complete');
    const answer = (await desktop.state()).conversations[0].messages.at(-1)!;
    expect(answer.content.trim().length).toBeGreaterThan(0);
    expect(answer.provider).toBe('llamacpp');
    expect(answer.effectiveContext).toBe(4096);
    expect(JSON.stringify(await desktop.state())).not.toContain(key);

    await page.evaluate(() => window.jaxos.startModelOperation({ model: 'acceptance-gguf', kind: 'unload' }));
    await expect.poll(async () => (await desktop.state()).modelOperations?.[0]).toMatchObject({ status: 'error', summary: 'JaxOS does not stop an attached server.' });
    expect(await health()).toBe(200);
    expect(desktop.consoleErrors).toEqual([]);
    await desktop.app!.close(); desktop.app = undefined;
    expect(await health()).toBe(200);
    expect((await readFile(path.join(desktop.temporaryRoot, 'data', 'workspace', 'workspace.sqlite'))).includes(Buffer.from(key))).toBe(false);
    await desktop.launch();
    const withoutKey = await desktop.page.evaluate(async () => {
      try { await window.jaxos.listModels(); return 'unexpected success'; }
      catch (error) { return String(error); }
    });
    expect(withoutKey).toContain('401');
    expect((await desktop.state()).conversations[0].messages.at(-1)?.content).toBe(answer.content);
    expect(desktop.consoleErrors).toEqual([]);
  } finally {
    try { await desktop.dispose(); } finally { await stopOwnedServer(server); }
  }
});

test('the actual installer-extracted application archive boots, persists and loads GGUF', async () => {
  test.skip(!process.env.JAXOS_TEST_RELEASE_ASAR || process.env.JAXOS_LIVE_LLAMA_TEST !== '1', 'Requires installer-extracted archive, llama-server and GGUF.');
  test.setTimeout(180000);
  const desktop = await DesktopHarness.create();
  try {
    const archive = process.env.JAXOS_TEST_RELEASE_ASAR!;
    const page = await desktop.launch(archive);
    expect(await desktop.app!.evaluate(({ app }) => app.getAppPath())).toBe(archive);
    await page.evaluate(async () => {
      await window.jaxos.addDailyItem('Installer archive acceptance fixture');
      await window.jaxos.saveSettings({ provider: 'llamacpp', llama: { mode: 'managed', url: 'http://127.0.0.1:8080', gpuLayers: 0, threads: 2 } });
      await window.jaxos.chooseLlamaFile('executable'); await window.jaxos.chooseLlamaFile('modelPath');
      await window.jaxos.saveModelProfile({ model: 'jaxos-gguf', profile: { contextTokens: 4096, outputTokens: 256, thinking: 'off', temperature: 0, keepAliveSeconds: 60, gpu: 'auto' } });
      await window.jaxos.startModelOperation({ model: 'jaxos-gguf', kind: 'load' });
    });
    await expect.poll(async () => (await desktop.state()).modelOperations?.[0]?.status, { timeout: 120000 }).toBe('complete');
    expect(await page.evaluate(() => window.jaxos.getLlamaStatus())).toMatchObject({ running: true, owned: true, contextTokens: 4096 });
    await page.evaluate(async () => { const state = await window.jaxos.getState(); await window.jaxos.sendMessage({ conversationId: state.activeConversationId!, text: 'Say hello briefly.' }); });
    await expect.poll(async () => (await desktop.state()).conversations[0].messages.at(-1)?.status, { timeout: 60000 }).toBe('complete');
    expect((await desktop.state()).conversations[0].messages.at(-1)?.content.trim().length).toBeGreaterThan(0);
    await page.evaluate(() => window.jaxos.startModelOperation({ model: 'jaxos-gguf', kind: 'unload' }));
    await expect.poll(async () => (await desktop.state()).modelOperations?.[0]?.status).toBe('complete');
    expect(await page.evaluate(() => window.jaxos.getLlamaStatus())).toMatchObject({ running: false });
    expect(desktop.consoleErrors).toEqual([]);
    await desktop.app!.close(); desktop.app = undefined;
    await desktop.launch(archive);
    expect((await desktop.state()).dailyItems).toMatchObject([{ text: 'Installer archive acceptance fixture' }]);
    expect((await desktop.state()).conversations[0].messages.at(-1)?.status).toBe('complete');
    expect(desktop.consoleErrors).toEqual([]);
  } finally { await desktop.dispose(); }
});
