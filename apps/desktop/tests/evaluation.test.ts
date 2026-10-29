import { describe, it, expect } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

describe('local evaluation comparison', () => {
  it('compares matching results and refuses changed environments, missing scores and empty reports', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-eval-test-'));
    try {
      const baseline = path.join(dir, 'baseline.json'); const candidate = path.join(dir, 'candidate.json');
      const report = { schemaVersion: 1, runId: 'one', suite: 'fixture', fixtureSha256: 'same', sourceSha256: 'base', environment: { node: 'same' }, results: [{ id: 'one', status: 'pass', durationMs: 1 }] };
      await writeFile(baseline, JSON.stringify(report));
      const invoke = () => execFileSync(process.execPath, ['scripts/eval.mjs', 'compare', '--baseline', baseline, '--candidate', candidate], { encoding: 'utf8', stdio: 'pipe' });
      await writeFile(candidate, JSON.stringify({ ...report, runId: 'two', sourceSha256: 'candidate' }));
      expect(invoke()).toContain('All candidate cases passed');
      await writeFile(candidate, JSON.stringify({ ...report, suite: 'heldout' }));
      expect(() => invoke()).toThrow();
      await writeFile(candidate, JSON.stringify({ ...report, environment: { node: 'different' } }));
      expect(() => invoke()).toThrow();
      await writeFile(candidate, JSON.stringify({ ...report, results: [{ id: 'one', status: 'unscored', durationMs: 1 }] }));
      expect(() => invoke()).toThrow();
      await writeFile(candidate, JSON.stringify({ ...report, results: [] }));
      expect(() => invoke()).toThrow();
      expect(JSON.parse(await readFile(baseline, 'utf8'))).toEqual(report);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('runs coordinator cancellation and crash recovery with isolated data and leaves absent live inference unscored', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-eval-integration-'));
    try {
      const output = path.join(dir, 'report.json');
      let exitCode = 0;
      try { await promisify(execFile)(process.execPath, ['scripts/eval.mjs', 'run', '--output', output, '--kicad', path.join(dir, 'missing-kicad')], { timeout: 60000 }); }
      catch (error) { exitCode = (error as { code: number }).code; }
      expect(exitCode).toBe(1);
      const report = JSON.parse(await readFile(output, 'utf8'));
      expect(report.results.find((r: {id:string}) => r.id === 'coordinator-active-cancel')).toMatchObject({status: 'pass', observed: {status: 'cancelled', requests: 1}});
      expect(report.results.find((r: {id:string}) => r.id === 'coordinator-crash-recovery')).toMatchObject({status: 'pass', observed: {status: 'error', finishReason: 'interrupted', requests: 1, interruptedTask: true}});
      expect(report.results.find((r: {id:string}) => r.id === 'coordinator-model-arithmetic')).toMatchObject({status:'unscored'});
      expect(report.results.find((r: {id:string}) => r.id === 'kicad-clean-drc')).toMatchObject({status:'unscored'});
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 70000);

  it('rejects malformed reports even when both files contain matching invalid data', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-eval-invalid-report-'));
    try {
      const baseline = path.join(dir, 'baseline.json'); const candidate = path.join(dir, 'candidate.json');
      const report = { schemaVersion: 1, runId: 'one', suite: 'fixture', fixtureSha256: 'same', sourceSha256: 'source', environment: { node: 'same' }, results: [{ id: 'one', status: 'pass', durationMs: 1 }] };
      const malformed: unknown[] = [
        null, {},
        ...['runId', 'suite', 'fixtureSha256', 'sourceSha256'].map(key => ({ ...report, [key]: '' })),
        { ...report, environment: null },
        { ...report, environment: [] },
        { ...report, results: [...report.results, ...report.results] },
        { ...report, results: [null] },
        { ...report, results: [{ status: 'pass', durationMs: 1 }] },
        { ...report, results: [{ id: 'one', status: 'skipped', durationMs: 1 }] },
        { ...report, results: [{ id: 'one', status: 'pass', durationMs: -1 }] },
        { ...report, results: [{ id: 'one', status: 'pass', durationMs: null }] },
      ];
      for (const value of malformed) {
        const bytes = JSON.stringify(value);
        await writeFile(baseline, bytes); await writeFile(candidate, bytes);
        let result: { code?: number; stdout?: string; stderr?: string } = {};
        try { result = await promisify(execFile)(process.execPath, ['scripts/eval.mjs', 'compare', '--baseline', baseline, '--candidate', candidate]); }
        catch (error) { result = error as typeof result; }
        expect(result.code).toBe(2);
        expect(result.stderr).toContain('Invalid evaluation report');
        expect(result.stdout).not.toContain('All candidate cases passed');
        expect(await readFile(baseline, 'utf8')).toBe(bytes);
        expect(await readFile(candidate, 'utf8')).toBe(bytes);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('refuses an occupied output before contacting a live runtime and preserves its bytes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-eval-output-'));
    let requests = 0;
    const server = createServer((request, response) => { requests++; request.resume(); response.end('{}'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const output = path.join(dir, 'do-not-overwrite.json');
      const bytes = 'Existing evaluation evidence\n'; await writeFile(output, bytes);
      let result: { code?: number; stdout?: string; stderr?: string } = {};
      try {
        result = await promisify(execFile)(process.execPath, ['scripts/eval.mjs', 'run', '--output', output, '--live-model', '--url', `http://127.0.0.1:${(server.address() as AddressInfo).port}`]);
      } catch (error) { result = error as typeof result; }
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('EEXIST');
      expect(result.stdout).not.toMatch(/(?:PASS|FAIL|UNSCORED) /);
      expect(requests).toBe(0);
      expect(await readFile(output, 'utf8')).toBe(bytes);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects ambiguous CLI options and invalid numeric input before creating reports', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-eval-invalid-args-'));
    try {
      const output = path.join(dir, 'report.json');
      const cases = [
        { args: ['--output', output], error: 'Duplicate argument --output' },
        { args: ['--live-model', '--live-model'], error: 'Duplicate argument --live-model' },
        { args: ['--context', 'not-a-number'], error: 'contextTokens must be an integer' },
        { args: ['--output-tokens', '12.5'], error: 'outputTokens must be an integer' },
        { args: ['--context'], error: 'Missing value for --context' },
      ];
      for (const entry of cases) {
        let result: { code?: number; stdout?: string; stderr?: string } = {};
        try { result = await promisify(execFile)(process.execPath, ['scripts/eval.mjs', 'run', '--output', output, ...entry.args]); }
        catch (error) { result = error as typeof result; }
        expect(result.code).toBe(2);
        expect(result.stderr).toContain(entry.error);
        expect(await readdir(dir)).toEqual([]);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

});
