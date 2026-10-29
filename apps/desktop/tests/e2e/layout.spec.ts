import { test, expect } from '@playwright/test';
import { DesktopHarness } from './harness';

test('capture the real desktop layouts and a narrow-width design inspection', async ({}, testInfo) => {
  const desktop = await DesktopHarness.create('clean');
  try {
    const page = await desktop.launch();
    async function resize(width: number, height: number) {
      await desktop.app!.evaluate(({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setMinimumSize(Math.min(740, size.width), 560);
        window.setSize(size.width, size.height);
      }, { width, height });
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    }
    async function capture(name: string) {
      const image = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path: image });
      await testInfo.attach(name, { path: image, contentType: 'image/png' });
    }
    await expect(page.getByRole('heading', { name: /One place to think/ })).toBeVisible();
    await resize(1440, 960);
    await capture('actual-conversation-1440');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByText(/^KiCad \d/)).toBeVisible();
    await capture('actual-settings-1440');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Daily', exact: true }).click();
    await page.getByRole('textbox', { name: 'New priority', exact: true }).fill('Review the prototype connector pinout');
    await page.getByRole('button', { name: 'Add priority', exact: true }).click();
    await resize(1280, 900);
    await capture('actual-daily-1280');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'Connect project', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const build = page.getByRole('region', { name: 'Build workbench', exact: true });
    await expect(build).toBeVisible();
    await build.getByRole('textbox', { name: 'Project goal', exact: true }).fill('Verify a two-pin connector before fabrication.');
    await build.getByRole('textbox', { name: 'Acceptance checks', exact: true }).fill('Electrical rules report no findings\nPCB design rules report no findings');
    await build.getByRole('button', { name: 'Save brief', exact: true }).click();
    await expect.poll(async () => (await desktop.state()).projects[0]?.goal).toBe('Verify a two-pin connector before fabrication.');
    await expect(build.getByRole('button', { name: 'Brief saved', exact: true })).toBeVisible();
    await build.evaluate(element => { element.scrollTop = 0; });
    await capture('actual-build-1280');

    // An inspection image only: Android is deferred and Windows has a 740px minimum width.
    await resize(390, 844);
    await build.evaluate(element => { element.scrollTop = 0; });
    await capture('narrow-design-inspection-390');
    await testInfo.attach('narrow-inspection-metrics', {
      body: JSON.stringify(await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }))),
      contentType: 'application/json',
    });
    expect(desktop.consoleErrors).toEqual([]);
  } finally { await desktop.dispose(); }
});
