import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Specify ${name}.`);
  return path.resolve(args[index + 1]);
}
if (args.length !== 4 || !args.includes('--extracted') || !args.includes('--output')) {
  throw new Error('Usage: node scripts/verify-windows-package.mjs --extracted DIRECTORY --output NEW_REPORT.json');
}
const extracted = option('--extracted');
const output = option('--output');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fileHash(file) {
  const value = createHash('sha256');
  for await (const chunk of createReadStream(file)) value.update(chunk);
  return value.digest('hex');
}
async function filesUnder(relative) {
  const result = [];
  for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(file));
    else if (entry.isFile()) result.push(file);
    else throw new Error(`Unsupported input entry: ${file}`);
  }
  return result;
}
async function peMachine(file) {
  const descriptor = await open(file, 'r');
  try {
    const header = Buffer.alloc(64);
    assert.equal((await descriptor.read(header, 0, header.length, 0)).bytesRead, 64, 'Executable DOS header is incomplete.');
    assert.equal(header.toString('ascii', 0, 2), 'MZ', 'Executable lacks a DOS header.');
    const offset = header.readUInt32LE(60);
    const pe = Buffer.alloc(6);
    assert.equal((await descriptor.read(pe, 0, pe.length, offset)).bytesRead, 6, 'Executable PE header is incomplete.');
    assert.equal(pe.toString('ascii', 0, 4), 'PE\0\0', 'Executable lacks a PE header.');
    return pe.readUInt16LE(4);
  } finally { await descriptor.close(); }
}

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const receipt = JSON.parse(await readFile(path.join(root, 'release/windows-build-receipt.json'), 'utf8'));
assert.equal(receipt.version, manifest.version, 'Build receipt has a different version.');
assert.equal(receipt.artifact, `JaxOS-Setup-${manifest.version}-win-x64.exe`, 'Unexpected installer name.');
const installer = path.join(root, 'release', receipt.artifact);
const installerSha256 = await fileHash(installer);
assert.equal(installerSha256, receipt.sha256, 'Installer hash differs from its build receipt.');
assert.equal((await stat(installer)).size, receipt.bytes, 'Installer size differs from its build receipt.');
const installerMachine = await peMachine(installer);
const archive = path.join(extracted, 'resources/app.asar');
const archiveSha256 = await fileHash(archive);
assert.equal(archiveSha256, receipt.appArchiveSha256, 'Extracted app archive differs from the receipt.');
assert.equal(archiveSha256, await fileHash(path.join(root, 'release/win-unpacked/resources/app.asar')), 'Extracted and staged archives differ.');
const archivedManifest = JSON.parse(extractFile(archive, 'package.json').toString());
assert.equal(archivedManifest.version, manifest.version, 'Archived version differs from the source manifest.');
assert.equal(archivedManifest.main, manifest.main, 'Archived application entry differs.');
assert.equal(archivedManifest.license, manifest.license, 'Archived license metadata differs.');
const executable = path.join(extracted, 'JaxOS.exe');
const applicationMachine = await peMachine(executable);
assert.equal(applicationMachine, 0x8664, 'Application is not a Windows x64 executable.');
const executableSha256 = await fileHash(executable);
assert.equal(executableSha256, await fileHash(path.join(root, 'release/win-unpacked/JaxOS.exe')), 'Extracted and staged executables differ.');
const wrapper = await readFile(path.join(extracted, 'evaluate.cmd'));
assert.deepEqual(wrapper, await readFile(path.join(root, 'build/evaluate.cmd')), 'Installed command wrapper differs from its source.');
const wrapperSha256 = hash(wrapper);
assert.equal(wrapperSha256, receipt.evaluation.wrapperSha256, 'Installed command wrapper differs from the receipt.');

const files = [
  'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md',
  ...await filesUnder('dist'), ...await filesUnder('dist-electron'),
  ...(await filesUnder('evaluation')).filter(file => file.endsWith('.json')),
  ...await filesUnder('tests/fixtures/kicad'),
];
const payload = [];
for (const file of files) {
  const expected = await readFile(path.join(root, file));
  // ASAR traverses directories with the host path separator.
  const actual = extractFile(archive, path.normalize(file));
  assert.deepEqual(actual, expected, `Archived payload differs from built input: ${file}`);
  payload.push({ file, bytes: actual.length, sha256: hash(actual) });
}
const report = {
  schemaVersion: 1, status: 'pass', checkedAt: new Date().toISOString(), version: manifest.version,
  installer: { path: installer, bytes: receipt.bytes, sha256: installerSha256, peMachine: `0x${installerMachine.toString(16)}` },
  extractedDirectory: extracted, appArchiveSha256: archiveSha256,
  application: { architecture: 'x64', peMachine: '0x8664', sha256: executableSha256 },
  evaluationWrapperSha256: wrapperSha256, payloadFilesVerified: payload.length, payload,
  checks: ['Installer matches build receipt', 'Extracted archive matches receipt and staging', 'Archived version and entry match manifest',
    'Extracted x64 application matches staging', 'Installed evaluation command matches source and receipt',
    'Renderer, desktop bundles, evaluation suites and KiCad fixtures match current built inputs'],
  nativeWindowsValidated: false,
  limitations: 'Static package verification on Linux. Does not execute Windows setup, upgrade, uninstall, cmd.exe, GPU drivers or native application runtime.',
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`Verified ${receipt.artifact}: ${payload.length} archived files matched; report ${output}`);
