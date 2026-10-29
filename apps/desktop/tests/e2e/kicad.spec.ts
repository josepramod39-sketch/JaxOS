import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Run, RunKind } from '../../shared/types';
import { appRoot, DesktopHarness } from './harness';

async function waitForRun(desktop: DesktopHarness, kind: RunKind, previousIds: string[] = []): Promise<Run> {
  let completed: Run | undefined;
  await expect.poll(async () => {
    const state = await desktop.state();
    completed = state.runs.find(run => run.kind === kind && !previousIds.includes(run.id));
    return completed && !['queued', 'running'].includes(completed.status);
  }, { timeout: 90_000 }).toBe(true);
  return completed!;
}

test('KiCad checks, previews and fabrication exports retain real evidence and detect changed inputs', async ({}, testInfo) => {
  test.setTimeout(240_000);
  const desktop = await DesktopHarness.create('clean');
  try {
    const page = await desktop.launch();
    const initialBoard = await readFile(desktop.projectPath!.replace('.kicad_pro', '.kicad_pcb'));
    await page.getByRole('button', { name: 'Open project', exact: true }).click();
    await expect.poll(async () => (await desktop.state()).projects.length).toBe(1);
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    const workbench = page.getByRole('region', { name: 'Test workbench', exact: true });
    await expect(workbench.getByRole('button', { name: 'Run electrical checks', exact: true })).toBeEnabled();
    await workbench.getByRole('button', { name: 'Run electrical checks', exact: true }).click();
    const erc = await waitForRun(desktop, 'erc');
    expect(erc.status).toBe('passed');
    expect(erc.exitCode).toBe(0);
    expect(erc.findings).toHaveLength(0);
    expect(erc.toolVersion).toMatch(/^\d+\./);
    expect(erc.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(erc.command.join(' ')).toContain('sch erc');
    await expect(workbench.getByText('Checks passed', { exact: true }).first()).toBeVisible();

    await workbench.getByRole('button', { name: 'Run PCB checks', exact: true }).click();
    const drc = await waitForRun(desktop, 'drc');
    expect(drc.status).toBe('passed');
    expect(drc.exitCode).toBe(0);
    expect(drc.findings).toHaveLength(0);
    expect(drc.inputFingerprint).toBe(erc.inputFingerprint);
    expect(drc.command.join(' ')).toContain('pcb drc');

    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const build = page.getByRole('region', { name: 'Build workbench', exact: true });
    await build.getByRole('button', { name: 'Generate previews', exact: true }).click();
    const preview = await waitForRun(desktop, 'preview');
    expect(preview.status).toBe('passed');
    const image = preview.artifacts.find(artifact => artifact.mime.startsWith('image/'));
    expect(image).toBeDefined();
    await build.getByRole('button').filter({ hasText: image!.name }).click();
    const generatedPreview = page.getByRole('img', { name: `Generated preview: ${image!.name}`, exact: true });
    await expect(generatedPreview).toBeVisible();
    await expect.poll(() => generatedPreview.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const previewImage = testInfo.outputPath('actual-kicad-preview.png');
    await page.screenshot({ path: previewImage });
    await testInfo.attach('actual-kicad-preview', { path: previewImage, contentType: 'image/png' });
    const previewDialog = page.getByRole('dialog', { name: image!.name, exact: true });
    const zoomLevel = previewDialog.getByLabel('Preview zoom', { exact: true });
    const viewport = previewDialog.getByLabel('Image preview', { exact: true });
    await expect(zoomLevel).toHaveText('100%');
    const fittedWidth = await generatedPreview.evaluate(element => element.getBoundingClientRect().width);
    for (let clicks = 0; clicks < 12 && Number.parseInt(await zoomLevel.innerText(), 10) < 400; clicks++) {
      await previewDialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
    }
    expect(Number.parseInt(await zoomLevel.innerText(), 10)).toBeGreaterThanOrEqual(400);
    await expect.poll(async () => {
      const width = await generatedPreview.evaluate(element => element.getBoundingClientRect().width);
      return width > await viewport.evaluate(element => element.clientWidth);
    }).toBe(true);
    const enlargedWidth = await generatedPreview.evaluate(element => element.getBoundingClientRect().width);
    // The real A4 fixture's J1/J2 connectors sit around (89mm, 78mm), away from page center.
    // Pan with actual wheel input so the zoomed screenshot demonstrates readable pin labels.
    const pan = await viewport.evaluate(element => {
      const canvas = element.querySelector('img')!.getBoundingClientRect();
      const frame = element.getBoundingClientRect();
      return { x: canvas.left + canvas.width * (89 / 297.0022) - frame.left - element.clientWidth / 2,
        y: canvas.top + canvas.height * (78 / 210.0072) - frame.top - element.clientHeight / 2 };
    });
    await viewport.hover();
    await page.mouse.wheel(pan.x, pan.y);
    await expect.poll(() => viewport.evaluate(element => {
      const canvas = element.querySelector('img')!.getBoundingClientRect();
      const frame = element.getBoundingClientRect();
      const x = canvas.left + canvas.width * (89 / 297.0022) - frame.left;
      const y = canvas.top + canvas.height * (78 / 210.0072) - frame.top;
      return Math.abs(x - element.clientWidth / 2) < 10 && Math.abs(y - element.clientHeight / 2) < 10;
    })).toBe(true);
    const zoomedImage = testInfo.outputPath('actual-kicad-preview-zoomed.png');
    await page.screenshot({ path: zoomedImage });
    await testInfo.attach('actual-kicad-preview-zoomed', { path: zoomedImage, contentType: 'image/png' });
    await previewDialog.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect.poll(() => generatedPreview.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(enlargedWidth);
    await previewDialog.getByRole('button', { name: 'Fit preview', exact: true }).click();
    await expect(zoomLevel).toHaveText('100%');
    await expect.poll(() => generatedPreview.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(fittedWidth, 0);
    await page.keyboard.press('Escape');

    await build.getByRole('button', { name: 'Export fabrication', exact: true }).click();
    const fabrication = await waitForRun(desktop, 'fabrication');
    expect(fabrication.status).toBe('passed');
    // KiCad defaults to layer-specific Protel Gerber extensions (.gtl, .gbl, ...).
    expect(fabrication.artifacts.some(artifact => /\.g(?:br|tl|bl|ts|bs|to|bo|m\d+)$/i.test(artifact.name))).toBe(true);
    expect(fabrication.artifacts.some(artifact => /\.drl$/i.test(artifact.name))).toBe(true);
    expect(fabrication.artifacts.some(artifact => artifact.name === 'bom.csv')).toBe(true);
    expect(fabrication.artifacts.some(artifact => artifact.name === 'placement-mm.csv')).toBe(true);
    await build.getByRole('button', { name: 'Export run', exact: true }).click();
    const exportRoot = path.join(desktop.temporaryRoot, 'exports');
    await expect.poll(async () => (await readdir(exportRoot)).length).toBe(1);
    const exportedDirectory = path.join(exportRoot, (await readdir(exportRoot))[0]);
    await expect.poll(async () => (await readdir(exportedDirectory)).includes('run-evidence.json')).toBe(true);
    const evidence = JSON.parse(await readFile(path.join(exportedDirectory, 'run-evidence.json'), 'utf8')) as Run;
    expect(evidence.id).toBe(fabrication.id);
    expect(evidence.inputFingerprint).toBe(fabrication.inputFingerprint);
    await testInfo.attach('actual-fabrication-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    for (const artifact of fabrication.artifacts) {
      const exportedArtifact = evidence.artifacts.find(item => item.id === artifact.id);
      expect(exportedArtifact).toBeDefined();
      expect(path.isAbsolute(exportedArtifact!.path)).toBe(false);
      expect(exportedArtifact!.path.split(/[\\/]/)[0]).toBe('output');
      const exported = path.resolve(exportedDirectory, exportedArtifact!.path);
      expect(path.relative(exportedDirectory, exported).startsWith('..')).toBe(false);
      const exportedBytes = await readFile(exported);
      expect(exportedBytes.length).toBeGreaterThan(0);
      expect(createHash('sha256').update(exportedBytes).digest('hex')).toBe(createHash('sha256').update(await readFile(artifact.path)).digest('hex'));
    }
    const exportedJob = evidence.artifacts.find(artifact => artifact.name.endsWith('.gbrjob'));
    expect(exportedJob).toBeDefined();
    const jobPath = path.resolve(exportedDirectory, exportedJob!.path);
    const job = JSON.parse(await readFile(jobPath, 'utf8')) as { FilesAttributes: { Path: string }[] };
    expect(job.FilesAttributes.length).toBeGreaterThan(0);
    for (const entry of job.FilesAttributes) {
      expect(path.isAbsolute(entry.Path)).toBe(false);
      const referencedGerber = path.resolve(path.dirname(jobPath), entry.Path);
      expect(path.relative(exportedDirectory, referencedGerber).startsWith('..')).toBe(false);
      expect((await readFile(referencedGerber)).length).toBeGreaterThan(0);
    }
    const outputEvidence = evidence.artifacts.find(artifact => artifact.name === 'run-evidence.json');
    expect(outputEvidence).toBeDefined();
    const manifest = JSON.parse(await readFile(path.resolve(exportedDirectory, outputEvidence!.path), 'utf8')) as {
      outputs: { relativePath: string; bytes: number; sha256: string }[];
    };
    expect(manifest.outputs.length).toBeGreaterThan(0);
    for (const output of manifest.outputs) {
      const bytes = await readFile(path.resolve(exportedDirectory, output.relativePath));
      expect(bytes.length).toBe(output.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(output.sha256);
    }
    expect(await readFile(desktop.projectPath!.replace('.kicad_pro', '.kicad_pcb'))).toEqual(initialBoard);

    // A deliberately removed trace must invalidate earlier evidence and fail the next real DRC.
    await copyFile(path.join(appRoot, 'tests/fixtures/kicad/fault/two-pin-link.kicad_pcb'), desktop.projectPath!.replace('.kicad_pro', '.kicad_pcb'));
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    await workbench.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(async () => (await desktop.state()).runs.find(run => run.id === drc.id)?.stale).toBe(true);
    await expect(workbench.getByText('The project changed after this run. Run the check again to verify the current files.', { exact: true })).toBeVisible();
    await workbench.getByRole('button', { name: 'Run PCB checks', exact: true }).click();
    const failed = await waitForRun(desktop, 'drc', [drc.id]);
    expect(failed.status).toBe('failed');
    expect(failed.exitCode).toBe(5);
    expect(failed.findings.length).toBeGreaterThan(0);
    expect(failed.inputFingerprint).not.toBe(drc.inputFingerprint);
    await expect(workbench.getByText('Checks failed', { exact: true }).first()).toBeVisible();
    expect(desktop.consoleErrors).toEqual([]);
    await testInfo.attach('actual-kicad-runs', { body: JSON.stringify((await desktop.state()).runs, null, 2), contentType: 'application/json' });
    const failedImage = testInfo.outputPath('actual-failed-kicad-check.png');
    await page.screenshot({ path: failedImage });
    await testInfo.attach('actual-failed-kicad-check', { path: failedImage, contentType: 'image/png' });
  } finally { await desktop.dispose(); }
});
