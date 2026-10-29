import { test, expect } from '@playwright/test';
import { DesktopHarness } from './harness';
import { getModelProfile } from '../../shared/model-profile';

test('real model lifecycle, profile, reasoning stream and effective context work through the coordinator', async ({}, testInfo) => {
  test.skip(process.env.JAXOS_LIVE_MODEL_TEST !== '1', 'Requires the installed local model.');
  test.setTimeout(240_000);
  const desktop = await DesktopHarness.create();
  try {
    let page = await desktop.launch();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Generation profile', { exact: false }).first().click();
    await page.getByRole('spinbutton', { name: 'Context tokens', exact: true }).fill('4096');
    await page.getByRole('spinbutton', { name: 'Maximum output tokens', exact: true }).fill('512');
    await expect(page.locator('#thinking-mode option[value="on"]')).toBeEnabled();
    await page.getByRole('combobox', { name: 'Thinking', exact: true }).selectOption('on');
    await page.getByRole('combobox', { name: 'Keep loaded', exact: true }).selectOption('60');
    await page.getByRole('combobox', { name: 'Processor policy', exact: true }).selectOption('cpu');
    await page.getByRole('button', { name: 'Save model profile', exact: true }).click();
    await expect.poll(async () => getModelProfile((await desktop.state()).settings).contextTokens).toBe(4096);
    await page.getByRole('button', { name: 'Load model', exact: true }).click();
    await expect.poll(async () => (await desktop.state()).modelOperations?.[0]?.status, { timeout: 90_000 }).toBe('complete');
    const loaded = await page.evaluate(() => window.jaxos.listLoadedModels());
    expect(loaded.find(item => item.name === 'qwen3:0.6b')?.contextTokens).toBe(4096);
    await expect(page.getByText(/Loaded · .*4,096 effective context/)).toBeVisible();
    await page.locator('.settings-body').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath('actual-model-manager.png') });
    await page.locator('.settings-disclosure').first().evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: testInfo.outputPath('actual-model-profile.png') });
    await page.setViewportSize({ width: 740, height: 560 });
    await page.screenshot({ path: testInfo.outputPath('actual-model-profile-740.png') });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();

    await page.getByRole('textbox', { name: 'Message JaxOS', exact: true }).fill('Think briefly: what is 2 plus 2? Give a very short final answer.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(async () => { const current = await desktop.state(); return current.conversations.find(item => item.id === current.activeConversationId)?.messages.at(-1)?.status; }, { timeout: 150_000 }).toBe('complete');
    const state = await desktop.state();
    const answer = state.conversations.find(item => item.id === state.activeConversationId)!.messages.at(-1)!;
    expect(answer.reasoning?.trim().length).toBeGreaterThan(0);
    expect(answer.content.trim().length).toBeGreaterThan(0);
    expect(answer.usage?.outputTokens).toBeGreaterThan(0);
    expect(answer.inference).toMatchObject({ contextTokens: 4096, thinking: 'on', outputTokens: 512, gpu: 'cpu' });
    await page.locator('.message-reasoning summary').click();
    await page.screenshot({ path: testInfo.outputPath('actual-model-reasoning.png') });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Unload model', exact: true }).click();
    await expect.poll(async () => (await desktop.state()).modelOperations?.[0]?.status, { timeout: 30_000 }).toBe('complete');
    expect((await page.evaluate(() => window.jaxos.listLoadedModels())).some(item => item.name === 'qwen3:0.6b')).toBe(false);
    page = await desktop.restart();
    const restored = await desktop.state();
    expect(getModelProfile(restored.settings)).toMatchObject({ contextTokens: 4096, thinking: 'on', outputTokens: 512 });
    expect(restored.conversations.find(item => item.id === state.activeConversationId)?.messages.at(-1)?.reasoning).toBe(answer.reasoning);
    expect(desktop.consoleErrors).toEqual([]);
  } finally { await desktop.dispose(); }
});

test('the desktop reconnects after coordinator failure and keeps working while hidden in tray mode', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const desktop = await DesktopHarness.create();
  try {
    const page = await desktop.launch();
    await page.evaluate(() => window.jaxos.addDailyItem('Survives coordinator recovery'));
    await desktop.app!.evaluate(({ app }) => {
      const worker = app.getAppMetrics().find(metric => metric.type === 'Utility' && JSON.stringify(metric).includes('JaxOS workspace coordinator'));
      if (!worker) throw new Error('The named workspace coordinator process was not found.');
      process.kill(worker.pid, 'SIGKILL');
    });
    await expect(page.getByRole('button', { name: 'Reconnect service', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('actual-service-disconnected.png') });
    await page.getByRole('button', { name: 'Reconnect service', exact: true }).click();
    await expect.poll(async () => (await page.evaluate(() => window.jaxos.getServiceStatus())).connected).toBe(true);
    expect((await desktop.state()).dailyItems[0].text).toBe('Survives coordinator recovery');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Keep working in the tray when the window closes', exact: true }).check();
    await expect.poll(async () => (await desktop.state()).settings.runInBackground).toBe(true);
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await page.evaluate(() => window.jaxos.windowControl('close'));
    await expect.poll(() => desktop.app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
    await page.evaluate(() => window.jaxos.addDailyItem('Coordinator works while the window is hidden'));
    await desktop.app!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].show(); });
    expect((await desktop.state()).dailyItems).toHaveLength(2);
    await page.getByRole('button', { name: 'Daily', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('actual-recovered-workspace.png') });
    expect(desktop.consoleErrors).toEqual([]);
  } finally { await desktop.dispose(); }
});
