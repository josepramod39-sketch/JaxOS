import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectKiCad, executeKiCad, fingerprintProject, inspectProject, parseKiCadFindings } from '../electron/kicad';
import type { Project, Run, RunKind } from '../shared/types';

const fixtures = fileURLToPath(new URL('./fixtures/kicad/', import.meta.url));
let temp: string;
let cli: string;
let clean: Project;
let fault: Project;

function newRun(project: Project, kind: RunKind): Run {
  return { id: randomUUID(), projectId: project.id, kind, status: 'queued', createdAt: new Date().toISOString(), inputFingerprint: project.fingerprint, stale: false, toolVersion: '', command: [], exitCode: null, summary: 'Queued', log: '', findings: [], artifacts: [] };
}

async function run(project: Project, kind: RunKind, extra: Partial<Parameters<typeof executeKiCad>[0]> = {}) {
  return executeKiCad({ project, run: newRun(project, kind), executable: cli, dataDir: path.join(temp, 'data'), ...extra });
}

beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'jaxos-kicad-'));
  await fs.cp(path.join(fixtures, 'clean'), path.join(temp, 'clean'), { recursive: true });
  await fs.cp(path.join(fixtures, 'fault'), path.join(temp, 'fault'), { recursive: true });
  clean = await inspectProject(path.join(temp, 'clean'));
  fault = await inspectProject(path.join(temp, 'fault', 'two-pin-link.kicad_pro'));
  const status = await detectKiCad(process.env.JAXOS_TEST_KICAD);
  if (!status.available) throw new Error(`Real KiCad 9+ is required for these integration tests: ${status.error}`);
  cli = status.path;
}, 20_000);

afterAll(async () => { if (temp) await fs.rm(temp, { recursive: true, force: true }); });

describe('actual KiCad checks and snapshot evidence', () => {
  it('discovers the project and includes changes to local library dependencies in its fingerprint', async () => {
    expect(clean.path).toBe(await fs.realpath(path.join(temp, 'clean')));
    expect(clean.schematic).toMatch(/two-pin-link\.kicad_sch$/);
    expect(clean.board).toMatch(/two-pin-link\.kicad_pcb$/);
    expect(await fingerprintProject(clean)).toBe(clean.fingerprint);
    const copied = path.join(temp, 'changed');
    await fs.cp(path.join(fixtures, 'clean'), copied, { recursive: true });
    const project = await inspectProject(copied);
    await fs.appendFile(path.join(copied, 'library', 'Connector_Generic.kicad_sym'), '\n');
    expect(await fingerprintProject(project)).not.toBe(project.fingerprint);
  });

  it.each(['erc', 'drc'] as const)('runs clean %s, preserves source bytes, and records exact commands plus hashes', async kind => {
    const before = await fingerprintProject(clean);
    const updates: Partial<Run>[] = [];
    const result = await run(clean, kind, { onUpdate: update => updates.push(update) });
    expect(result.status, result.error ?? result.log).toBe('passed');
    expect(result.exitCode).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.inputFingerprint).toBe(before);
    expect(await fingerprintProject(clean)).toBe(before);
    expect(result.toolVersion).toMatch(/^\d+\.\d+/);
    expect(result.stale).toBe(false);
    expect(updates.some(update => update.status === 'running')).toBe(true);
    const manifest = result.artifacts.find(artifact => artifact.name === 'run-evidence.json');
    expect(manifest).toBeDefined();
    const evidence = JSON.parse(await fs.readFile(manifest!.path, 'utf8'));
    expect(evidence.commands.some((c: {command: string[]}) => c.command.includes('--exit-code-violations'))).toBe(true);
    expect(evidence.commands.every((c: {exitCode: unknown}) => typeof c.exitCode === 'number')).toBe(true);
    expect(evidence.inputs.some((file: {path: string}) => file.path.endsWith('.kicad_sym'))).toBe(true);
    expect(evidence.inputs.every((file: {sha256: string}) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(result.command.some(value => value.includes(`${path.sep}input${path.sep}`))).toBe(true);
  }, 30_000);

  it.each([['erc', 2, 'pin_not_connected'], ['drc', 1, 'unconnected_items']] as const)('reports actual %s faults with exit 5', async (kind, count, rule) => {
    const result = await run(fault, kind);
    expect(result.status, result.error ?? result.log).toBe('failed');
    expect(result.exitCode).toBe(5);
    expect(result.findings.filter(finding => finding.rule === rule)).toHaveLength(count);
    expect(result.findings.filter(finding => finding.rule === rule).every(finding => finding.severity === 'error')).toBe(true);
    const report = result.artifacts.find(artifact => artifact.name === `${kind}.json`)!;
    expect(report.bytes).toBeGreaterThan(100);
    if (kind === 'drc') {
      const json = JSON.parse(await fs.readFile(report.path, 'utf8'));
      expect(json.violations).toEqual([]);
      expect(json.unconnected_items).toHaveLength(1);
    }
  }, 30_000);

  it('exports actual schematic and PCB SVGs from the saved snapshot', async () => {
    const result = await run(clean, 'preview');
    expect(result.status, result.error ?? result.log).toBe('passed');
    const svgFiles = result.artifacts.filter(artifact => artifact.mime === 'image/svg+xml');
    expect(svgFiles).toHaveLength(2);
    for (const artifact of svgFiles) {
      const text = await fs.readFile(artifact.path, 'utf8');
      expect(text).toMatch(/<svg[\s>]/);
      expect(text).toMatch(/<path[\s>]/);
      expect(artifact.bytes).toBeGreaterThan(1_000);
    }
  }, 30_000);

  it('exports a complete Gerber and drill set only after successful checks', async () => {
    const result = await run(clean, 'fabrication');
    expect(result.status, result.error ?? result.log).toBe('passed');
    expect(result.findings).toEqual([]);
    expect(result.artifacts.some(artifact => artifact.name.endsWith('.drl'))).toBe(true);
    expect(result.artifacts.some(artifact => artifact.name.includes('Edge_Cuts'))).toBe(true);
    expect(result.artifacts.filter(artifact => artifact.path.includes(`${path.sep}fabrication${path.sep}`))).toHaveLength(11);
    const bom = await fs.readFile(result.artifacts.find(artifact => artifact.name === 'bom.csv')!.path, 'utf8');
    expect(bom).toContain('"Reference","Value","Footprint","Quantity","DNP"');
    expect(bom).toMatch(/"J1","Conn_01x02",[^\n]+,"1",""/);
    expect(bom).toMatch(/"J2","Conn_01x02",[^\n]+,"1",""/);
    const positions = await fs.readFile(result.artifacts.find(artifact => artifact.name === 'placement-mm.csv')!.path, 'utf8');
    expect(positions).toContain('Ref,Val,Package,PosX,PosY,Rot,Side');
    expect(positions).toContain('20.000000,-20.000000,0.000000,top');
    expect(positions).toContain('40.000000,-20.000000,0.000000,top');
    const evidence = JSON.parse(await fs.readFile(result.artifacts.find(artifact => artifact.name === 'run-evidence.json')!.path, 'utf8'));
    const positionCommand = evidence.commands.find((c: {command: string[]}) => c.command.includes('pos') && !c.command.includes('--help')).command;
    expect(positionCommand).toEqual(expect.arrayContaining(['--format', 'csv', '--units', 'mm', '--side', 'both']));
    expect(positionCommand).not.toContain('--smd-only');
    const commands = evidence.commands.filter((c: {command: string[]}) => !c.command.includes('--help')).map((c: {command: string[]}) => c.command.slice(1, 4).join(' '));
    expect(commands.findIndex((c: string) => c.startsWith('sch erc'))).toBeLessThan(commands.findIndex((c: string) => c.startsWith('pcb export gerbers')));
    expect(commands.findIndex((c: string) => c.startsWith('pcb drc'))).toBeLessThan(commands.findIndex((c: string) => c.startsWith('pcb export gerbers')));
  }, 30_000);

  it('includes internal copper layers in manufacturing exports for a four-layer PCB', async () => {
    const copied = path.join(temp, 'four-layer');
    await fs.cp(path.join(fixtures, 'clean'), copied, { recursive: true });
    const filename = path.join(copied, 'two-pin-link.kicad_pcb');
    const board = (await fs.readFile(filename, 'utf8')).replace('(0 "F.Cu" signal)', '(0 "F.Cu" signal)\n\t\t(4 "In1.Cu" signal)\n\t\t(6 "In2.Cu" signal)');
    await fs.writeFile(filename, board);
    const project = await inspectProject(copied);
    const result = await run(project, 'fabrication');
    expect(result.status, result.error ?? result.log).toBe('passed');
    expect(result.artifacts.some(a => a.name.includes('In1_Cu'))).toBe(true);
    expect(result.artifacts.some(a => a.name.includes('In2_Cu'))).toBe(true);
    expect(result.artifacts.filter(a => a.path.includes(`${path.sep}fabrication${path.sep}`))).toHaveLength(13);
  }, 30_000);

  it('marks results stale when the source changes after the snapshot was captured', async () => {
    const copied = path.join(temp, 'during-run');
    await fs.cp(path.join(fixtures, 'clean'), copied, { recursive: true });
    const project = await inspectProject(copied);
    let changed = false;
    const result = await run(project, 'erc', { onUpdate(patch) {
      if (patch.toolVersion && !changed) { changed = true; appendFileSync(project.schematic!, '\n'); }
    }});
    expect(changed).toBe(true);
    expect(result.status, result.error ?? result.log).toBe('passed');
    expect(result.inputFingerprint).toBe(project.fingerprint);
    expect(result.stale).toBe(true);
    expect(await fingerprintProject(project)).not.toBe(result.inputFingerprint);
  }, 30_000);

  it('flags DRC parity and blocks fabrication when schematic and board disagree', async () => {
    const copied = path.join(temp, 'parity-mismatch');
    await fs.cp(path.join(fixtures, 'clean'), copied, { recursive: true });
    const filename = path.join(copied, 'two-pin-link.kicad_sch');
    const schematic = (await fs.readFile(filename, 'utf8')).replace('(property "Value" "Conn_01x02" (at 76.2', '(property "Value" "Changed connector" (at 76.2');
    await fs.writeFile(filename, schematic);
    const project = await inspectProject(copied);
    expect((await run(project, 'erc')).status).toBe('passed');
    expect((await run(project, 'drc')).status).toBe('failed');
    const result = await run(project, 'fabrication');
    expect(result.status, result.error ?? result.log).toBe('failed');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.artifacts.some(a => a.name.endsWith('.drl'))).toBe(false);
    const report = JSON.parse(await fs.readFile(result.artifacts.find(a => a.name === 'drc.json')!.path, 'utf8'));
    expect(report.schematic_parity.length).toBeGreaterThan(0);
  }, 30_000);

  it('blocks fabrication when the PCB has an actual disconnected net', async () => {
    const result = await run(fault, 'fabrication');
    expect(result.status, result.error ?? result.log).toBe('failed');
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings.some(finding => finding.rule === 'unconnected_items')).toBe(true);
    expect(result.artifacts.some(artifact => artifact.name.endsWith('.drl'))).toBe(false);
    expect(result.log).not.toContain('"gerbers"');
  }, 30_000);
});

describe('report integrity and filesystem boundaries', () => {
  it('includes all DRC categories and preserves exclusions without trusting only the general violations array', () => {
    const item = (description: string, severity: string, extra = {}) => ({ description, severity, type: description, items: [{description: 'J1 pin 1'}], ...extra });
    const findings = parseKiCadFindings({ violations: [item('clearance', 'warning')], unconnected_items: [item('unconnected', 'error')], schematic_parity: [item('missing_footprint', 'error', {excluded: true})] }, 'drc');
    expect(findings.map(f => f.rule)).toEqual(['clearance', 'unconnected', 'missing_footprint']);
    expect(findings[2].excluded).toBe(true);
    expect(findings[0].location).toBe('J1 pin 1');
    expect(() => parseKiCadFindings({ violations: [] }, 'drc')).toThrow();
    expect(() => parseKiCadFindings({ sheets: [{violations: [{severity: 'error'}]}] }, 'erc')).toThrow();
  });

  it('rejects ambiguous folders and symlink dependencies before launching KiCad', async () => {
    const copied = path.join(temp, 'unsafe');
    await fs.cp(path.join(fixtures, 'clean'), copied, { recursive: true });
    await fs.copyFile(path.join(copied, 'two-pin-link.kicad_pro'), path.join(copied, 'other.kicad_pro'));
    await expect(inspectProject(copied)).rejects.toThrow('multiple KiCad projects');
    await fs.rm(path.join(copied, 'other.kicad_pro'));
    await fs.symlink(path.join(temp, 'fault'), path.join(copied, 'outside-project'), 'junction');
    await expect(inspectProject(copied)).rejects.toThrow('symbolic link');
  });

  it('rejects library references outside the selected project', async () => {
    const copied = path.join(temp, 'outside-ref');
    await fs.cp(path.join(fixtures, 'clean'), copied, { recursive: true });
    const table = path.join(copied, 'sym-lib-table');
    await fs.writeFile(table, '(sym_lib_table (version 7) (lib (name "Connector_Generic")(type "KiCad")(uri "../clean/library/Connector_Generic.kicad_sym")(options "")(descr "")))');
    const project = await inspectProject(copied);
    const result = await run(project, 'erc');
    expect(result.status).toBe('error');
    expect(result.error).toContain('outside the selected folder');
    expect(result.command).toEqual([]);
  });

  it('does not let a stored file path escape the selected project', async () => {
    const tampered = { ...clean, schematic: fault.schematic };
    const result = await run(tampered, 'erc');
    expect(result.status).toBe('error');
    expect(result.error).toContain('outside the selected project');
  });

  it('cancels an active KiCad process and records the attempted command', async () => {
    const controller = new AbortController();
    const result = await run(clean, 'erc', { signal: controller.signal, onUpdate(patch) {
      if (patch.log?.includes('Checking sheet names')) controller.abort();
    }});
    expect(controller.signal.aborted).toBe(true);
    expect(result.status).toBe('cancelled');
    const artifact = result.artifacts.find(a => a.name === 'run-evidence.json');
    expect(artifact).toBeDefined();
    const manifest = JSON.parse(await fs.readFile(artifact!.path, 'utf8'));
    expect(manifest.commands.some((c: {command: string[]}) => c.command.includes('--exit-code-violations'))).toBe(true);
    expect(manifest.status).toBe('cancelled');
  }, 30_000);

  it('honors cancellation and never reuses a previous run directory', async () => {
    const controller = new AbortController(); controller.abort();
    const cancelled = await run(clean, 'erc', {signal: controller.signal});
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.artifacts).toEqual([]);
    const initial = newRun(clean, 'erc');
    const result = await executeKiCad({ project: clean, run: initial, executable: cli, dataDir: path.join(temp, 'data') });
    expect(result.status).toBe('passed');
    const again = await executeKiCad({ project: clean, run: initial, executable: cli, dataDir: path.join(temp, 'data') });
    expect(again.status).toBe('error');
    expect(again.artifacts).toEqual([]);
  }, 30_000);
});
