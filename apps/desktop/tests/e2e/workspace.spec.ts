import { test, expect } from '@playwright/test';
import { DesktopHarness } from './harness';

test('daily priorities survive restart, completion and deletion', async ({}, testInfo) => {
  const desktop = await DesktopHarness.create();
  try {
    let page = await desktop.launch();
    expect(await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
    }))).toEqual({ require: 'undefined', process: 'undefined' });
    await expect(page.getByRole('button', { name: 'Brainstorm', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Daily', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Daily', exact: true }).click();
    await page.getByRole('textbox', { name: 'New priority', exact: true }).fill('Review the two-pin prototype');
    await page.getByRole('button', { name: 'Add priority', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Complete: Review the two-pin prototype', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Mark incomplete: Review the two-pin prototype', exact: true })).toBeChecked();
    await page.getByRole('textbox', { name: 'New priority', exact: true }).fill('Temporary note to remove');
    await page.getByRole('button', { name: 'Add priority', exact: true }).click();
    await page.getByRole('button', { name: 'Delete priority: Temporary note to remove', exact: true }).click();
    await expect(page.getByText('Temporary note to remove', { exact: true })).toHaveCount(0);

    page = await desktop.restart();
    await page.getByRole('button', { name: 'Daily', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Mark incomplete: Review the two-pin prototype', exact: true })).toBeChecked();
    await expect(page.getByText('Temporary note to remove', { exact: true })).toHaveCount(0);
    expect((await desktop.state()).dailyItems).toMatchObject([{ text: 'Review the two-pin prototype', done: true }]);
    expect(desktop.consoleErrors).toEqual([]);
    await testInfo.attach('daily-after-restart', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { await desktop.dispose(); }
});

test('a real local-model response and conversation history survive restart', async ({}, testInfo) => {
  test.skip(process.env.JAXOS_LIVE_MODEL_TEST !== '1', 'Set JAXOS_LIVE_MODEL_TEST=1 with an installed Ollama model.');
  test.setTimeout(180_000);
  const desktop = await DesktopHarness.create();
  try {
    let page = await desktop.launch();
    const model = process.env.JAXOS_TEST_MODEL || 'qwen3:0.6b';
    const modelSelect = page.getByRole('combobox', { name: 'Chat model', exact: true });
    await expect(modelSelect).toBeVisible();
    await modelSelect.selectOption(model);
    const prompt = 'In one brief sentence, name one thing to check before powering a small circuit.';
    await page.getByRole('textbox', { name: 'Message JaxOS', exact: true }).fill(prompt);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(async () => {
      const state = await desktop.state();
      const conversation = state.conversations.find(item => item.id === state.activeConversationId);
      return conversation?.messages.at(-1)?.status;
    }, { timeout: 150_000 }).toBe('complete');
    const state = await desktop.state();
    const conversation = state.conversations.find(item => item.id === state.activeConversationId)!;
    expect(conversation.messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(conversation.messages[1].content.trim().length).toBeGreaterThan(5);
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();

    page = await desktop.restart();
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    const restored = (await desktop.state()).conversations.find(item => item.id === conversation.id);
    expect(restored?.messages).toEqual(conversation.messages);
    expect(desktop.consoleErrors).toEqual([]);
    await testInfo.attach('real-local-model-conversation', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { await desktop.dispose(); }
});
