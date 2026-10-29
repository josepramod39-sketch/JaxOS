import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createPackage } from '@electron/asar';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const appRoot = process.cwd();
const electron = createRequire(import.meta.url)('electron') as string;
const kicad = process.env.JAXOS_TEST_KICAD_PATH || (process.platform === 'linux' ? '/usr/bin/kicad-cli' : '');
let temporaryRoot: string;
let archive: string;
let unrelatedCwd: string;
type EvaluationReport = { sourceSha256: string; results: { id: string; status: string; observed?: Record<string, unknown> }[] };

beforeAll(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'jaxos-packaged-eval-'));
  const stage = path.join(temporaryRoot, 'stage');
  unrelatedCwd = path.join(temporaryRoot, 'unrelated');
  await mkdir(unrelatedCwd);
  await mkdir(stage);
  await build({ absWorkingDir: appRoot, entryPoints: {
    main: 'electron/main.ts', preload: 'electron/preload.ts', 'service-host': 'electron/service-host.ts',
    'llama-host': 'electron/llama-host.ts', eval: 'evaluation/cli.ts',
  }, outdir: path.join(stage, 'dist-electron'), outExtension: { '.js': '.cjs' }, bundle: true,
  platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
  await cp(path.join(appRoot, 'package.json'), path.join(stage, 'package.json'));
  await cp(path.join(appRoot, 'evaluation'), path.join(stage, 'evaluation'), {
    recursive: true, filter: source => !source.endsWith('.ts'),
  });
  await cp(path.join(appRoot, 'tests/fixtures/kicad'), path.join(stage, 'tests/fixtures/kicad'), { recursive: true });
  archive = path.join(temporaryRoot, 'app.asar');
  await createPackage(stage, archive);
  // Prove that neither a source checkout nor a loose staging directory is needed.
  await rm(stage, { recursive: true });
});
afterAll(async () => { if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true }); });

async function evaluate(name: string, executable: string) {
  const output = path.join(unrelatedCwd, name + '.json');
  let exitCode = 0;
  try {
    await execute(electron, [path.join(archive, 'dist-electron', 'eval.cjs'), 'run', '--output', output, '--kicad', executable], {
      cwd: unrelatedCwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 70000,
    });
  } catch (error) { exitCode = (error as { code: number }).code; }
  expect(exitCode).toBe(1); // Missing optional live-model scores are never reported as a green run.
  const report = JSON.parse(await readFile(output, 'utf8')) as EvaluationReport;
  expect(report.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  return report;
}

describe('evaluation CLI shipped inside ASAR', () => {
  it('runs its private coordinator and recovery fixtures from an unrelated directory without system Node', async () => {
    const report = await evaluate('without-tools', path.join(unrelatedCwd, 'missing-kicad'));
    expect(report.results.find(result => result.id === 'coordinator-active-cancel')).toMatchObject({ status: 'pass', observed: { status: 'cancelled', requests: 1 } });
    expect(report.results.find(result => result.id === 'coordinator-crash-recovery')).toMatchObject({ status: 'pass', observed: { status: 'error', finishReason: 'interrupted', requests: 1 } });
    expect(report.results.find(result => result.id === 'coordinator-model-arithmetic')?.status).toBe('unscored');
  }, 80000);

  it.runIf(Boolean(kicad && existsSync(kicad)))('copies archived KiCad fixtures and executes actual clean, fault, stale and cancellation checks', async () => {
    const report = await evaluate('with-kicad', kicad);
    const results = report.results.filter(result => result.id.startsWith('kicad-'));
    expect(results).toHaveLength(4);
    expect(results.map(result => ({ id: result.id, status: result.status }))).toEqual(expect.arrayContaining([
      { id: 'kicad-clean-drc', status: 'pass' }, { id: 'kicad-fault-drc', status: 'pass' },
    ]));
    expect(results.every(result => result.status === 'pass')).toBe(true);
  }, 80000);
});
