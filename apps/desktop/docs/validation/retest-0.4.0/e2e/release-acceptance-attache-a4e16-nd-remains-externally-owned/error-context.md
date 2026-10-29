# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: release-acceptance.spec.ts >> attached authenticated llama.cpp works through Settings and remains externally owned
- Location: tests/e2e/release-acceptance.spec.ts:26:1

# Error details

```
TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'Model name', exact: true })

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { spawn, type ChildProcess } from 'node:child_process';
  3   | import { randomBytes } from 'node:crypto';
  4   | import { createServer } from 'node:net';
  5   | import { readFile, writeFile } from 'node:fs/promises';
  6   | import path from 'node:path';
  7   | import { DesktopHarness } from './harness';
  8   | 
  9   | async function availablePort() {
  10  |   const server = createServer();
  11  |   await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  12  |   const address = server.address();
  13  |   if (!address || typeof address === 'string') throw new Error('No local port allocated.');
  14  |   await new Promise<void>(resolve => server.close(() => resolve()));
  15  |   return address.port;
  16  | }
  17  | async function stopOwnedServer(child?: ChildProcess) {
  18  |   if (!child || child.exitCode !== null || child.signalCode !== null) return;
  19  |   await new Promise<void>(resolve => {
  20  |     const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  21  |     child.once('exit', () => { clearTimeout(timer); resolve(); });
  22  |     child.kill('SIGTERM');
  23  |   });
  24  | }
  25  | 
  26  | test('attached authenticated llama.cpp works through Settings and remains externally owned', async () => {
  27  |   test.skip(process.env.JAXOS_LIVE_LLAMA_TEST !== '1', 'Requires real llama-server and GGUF.');
  28  |   test.setTimeout(180000);
  29  |   const desktop = await DesktopHarness.create();
  30  |   let server: ChildProcess | undefined;
  31  |   try {
  32  |     const port = await availablePort();
  33  |     const endpoint = `http://127.0.0.1:${port}`;
  34  |     const key = randomBytes(32).toString('hex');
  35  |     const keyPath = path.join(desktop.temporaryRoot, 'external-server-key');
  36  |     await writeFile(keyPath, key + '\n', { mode: 0o600 });
  37  |     server = spawn(process.env.JAXOS_TEST_LLAMA_BIN!, [
  38  |       '--model', process.env.JAXOS_TEST_LLAMA_MODEL!, '--alias', 'acceptance-gguf',
  39  |       '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '4096',
  40  |       '--n-gpu-layers', '0', '--threads', '2', '--parallel', '1',
  41  |       '--jinja', '--reasoning-format', 'deepseek', '--api-key-file', keyPath,
  42  |     ], { stdio: 'ignore', shell: false, windowsHide: true });
  43  |     let startError = '';
  44  |     server.on('error', error => { startError = error.message; });
  45  |     const health = async () => {
  46  |       if (startError) throw new Error(startError);
  47  |       try { return (await fetch(endpoint + '/health', { signal: AbortSignal.timeout(2000) })).status; }
  48  |       catch { return 0; }
  49  |     };
  50  |     await expect.poll(health, { timeout: 120000 }).toBe(200);
  51  |     expect((await fetch(endpoint + '/v1/models')).status).toBe(401);
  52  | 
  53  |     const page = await desktop.launch();
  54  |     await page.getByRole('button', { name: 'Settings', exact: true }).click();
  55  |     await page.getByRole('combobox', { name: 'Model runtime', exact: true }).selectOption('llamacpp');
  56  |     await page.getByRole('combobox', { name: 'llama.cpp connection', exact: true }).selectOption('external');
  57  |     await page.getByRole('textbox', { name: 'llama.cpp address', exact: true }).fill(endpoint);
> 58  |     await page.getByRole('textbox', { name: 'Model name', exact: true }).fill('acceptance-gguf');
      |                                                                          ^ TimeoutError: locator.fill: Timeout 30000ms exceeded.
  59  |     await page.getByLabel('Session API key (optional)', { exact: true }).fill(key);
  60  |     await page.getByRole('button', { name: 'Save and connect', exact: true }).click();
  61  |     await expect(page.getByText('Connection saved. Choose a model reported by this runtime.', { exact: true })).toBeVisible();
  62  |     await expect(page.getByText(/Loaded · .*4,096 effective context/)).toBeVisible();
  63  |     await expect(page.getByRole('button', { name: 'Load model', exact: true })).toBeDisabled();
  64  |     await expect(page.getByRole('button', { name: 'Unload model', exact: true })).toBeDisabled();
  65  |     await expect(page.getByLabel('Session API key (optional)', { exact: true })).toHaveValue('');
  66  |     await page.locator('.settings-disclosure summary').first().click();
  67  |     await expect(page.getByRole('combobox', { name: 'Keep loaded', exact: true })).toBeDisabled();
  68  |     await expect(page.getByRole('spinbutton', { name: 'Context tokens', exact: true })).toHaveAttribute('max', '4096');
  69  |     await page.getByRole('spinbutton', { name: 'Context tokens', exact: true }).fill('4096');
  70  |     await page.getByRole('spinbutton', { name: 'Maximum output tokens', exact: true }).fill('256');
  71  |     await page.getByRole('button', { name: 'Save model profile', exact: true }).click();
  72  |     await expect(page.getByRole('button', { name: 'Save model profile', exact: true })).toBeEnabled();
  73  |     await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  74  |     await page.getByRole('textbox', { name: 'Message JaxOS', exact: true }).fill('What is 2 plus 2? Answer briefly.');
  75  |     await page.getByRole('button', { name: 'Send message', exact: true }).click();
  76  |     await expect.poll(async () => (await desktop.state()).conversations[0].messages.at(-1)?.status, { timeout: 60000 }).toBe('complete');
  77  |     const answer = (await desktop.state()).conversations[0].messages.at(-1)!;
  78  |     expect(answer.content.trim().length).toBeGreaterThan(0);
  79  |     expect(answer.provider).toBe('llamacpp');
  80  |     expect(answer.effectiveContext).toBe(4096);
  81  |     expect(JSON.stringify(await desktop.state())).not.toContain(key);
  82  | 
  83  |     await page.evaluate(() => window.jaxos.startModelOperation({ model: 'acceptance-gguf', kind: 'unload' }));
  84  |     await expect.poll(async () => (await desktop.state()).modelOperations?.[0]).toMatchObject({ status: 'error', summary: 'JaxOS does not stop an attached server.' });
  85  |     expect(await health()).toBe(200);
  86  |     expect(desktop.consoleErrors).toEqual([]);
  87  |     await desktop.app!.close(); desktop.app = undefined;
  88  |     expect(await health()).toBe(200);
  89  |     expect((await readFile(path.join(desktop.temporaryRoot, 'data', 'workspace', 'workspace.sqlite'))).includes(Buffer.from(key))).toBe(false);
  90  |     await desktop.launch();
  91  |     const withoutKey = await desktop.page.evaluate(async () => {
  92  |       try { await window.jaxos.listModels(); return 'unexpected success'; }
  93  |       catch (error) { return String(error); }
  94  |     });
  95  |     expect(withoutKey).toContain('401');
  96  |     expect((await desktop.state()).conversations[0].messages.at(-1)?.content).toBe(answer.content);
  97  |     expect(desktop.consoleErrors).toEqual([]);
  98  |   } finally {
  99  |     try { await desktop.dispose(); } finally { await stopOwnedServer(server); }
  100 |   }
  101 | });
  102 | 
  103 | test('the actual installer-extracted application archive boots, persists and loads GGUF', async () => {
  104 |   test.skip(!process.env.JAXOS_TEST_RELEASE_ASAR || process.env.JAXOS_LIVE_LLAMA_TEST !== '1', 'Requires installer-extracted archive, llama-server and GGUF.');
  105 |   test.setTimeout(180000);
  106 |   const desktop = await DesktopHarness.create();
  107 |   try {
  108 |     const archive = process.env.JAXOS_TEST_RELEASE_ASAR!;
  109 |     const page = await desktop.launch(archive);
  110 |     expect(await desktop.app!.evaluate(({ app }) => app.getAppPath())).toBe(archive);
  111 |     await page.evaluate(async () => {
  112 |       await window.jaxos.addDailyItem('Installer archive acceptance fixture');
  113 |       await window.jaxos.saveSettings({ provider: 'llamacpp', llama: { mode: 'managed', url: 'http://127.0.0.1:8080', gpuLayers: 0, threads: 2 } });
  114 |       await window.jaxos.chooseLlamaFile('executable'); await window.jaxos.chooseLlamaFile('modelPath');
  115 |       await window.jaxos.saveModelProfile({ model: 'jaxos-gguf', profile: { contextTokens: 4096, outputTokens: 256, thinking: 'off', temperature: 0, keepAliveSeconds: 60, gpu: 'auto' } });
  116 |       await window.jaxos.startModelOperation({ model: 'jaxos-gguf', kind: 'load' });
  117 |     });
  118 |     await expect.poll(async () => (await desktop.state()).modelOperations?.[0]?.status, { timeout: 120000 }).toBe('complete');
  119 |     expect(await page.evaluate(() => window.jaxos.getLlamaStatus())).toMatchObject({ running: true, owned: true, contextTokens: 4096 });
  120 |     await page.evaluate(async () => { const state = await window.jaxos.getState(); await window.jaxos.sendMessage({ conversationId: state.activeConversationId!, text: 'Say hello briefly.' }); });
  121 |     await expect.poll(async () => (await desktop.state()).conversations[0].messages.at(-1)?.status, { timeout: 60000 }).toBe('complete');
  122 |     expect((await desktop.state()).conversations[0].messages.at(-1)?.content.trim().length).toBeGreaterThan(0);
  123 |     await page.evaluate(() => window.jaxos.startModelOperation({ model: 'jaxos-gguf', kind: 'unload' }));
  124 |     await expect.poll(async () => (await desktop.state()).modelOperations?.[0]?.status).toBe('complete');
  125 |     expect(await page.evaluate(() => window.jaxos.getLlamaStatus())).toMatchObject({ running: false });
  126 |     expect(desktop.consoleErrors).toEqual([]);
  127 |     await desktop.app!.close(); desktop.app = undefined;
  128 |     await desktop.launch(archive);
  129 |     expect((await desktop.state()).dailyItems).toMatchObject([{ text: 'Installer archive acceptance fixture' }]);
  130 |     expect((await desktop.state()).conversations[0].messages.at(-1)?.status).toBe('complete');
  131 |     expect(desktop.consoleErrors).toEqual([]);
  132 |   } finally { await desktop.dispose(); }
  133 | });
  134 | 
```