import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { extractFile } from '@electron/asar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Installer version must be major.minor.patch.');

const release = path.join(root, 'release');
const staging = path.join(release, 'win-unpacked');
const installer = path.join(release, `JaxOS-Setup-${version}-win-x64.exe`);
await mkdir(release, { recursive: true });
for (const file of ['dist-electron/eval.cjs', 'build/evaluate.cmd', 'build/installer.nsi']) {
  try { await access(path.join(root, file)); }
  catch { throw new Error(`Required packaging input is missing: ${file}. Build the desktop and include its packaging sources.`); }
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv }, shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed (${signal ?? code}).`));
    });
  });
}

// This stages a Windows app; it does not execute or validate Windows binaries.
const builderArgs = [require.resolve('electron-builder/cli.js'), '--win', '--x64', '--dir', '--publish', 'never'];
// Electron's npm installer honors this cache variable; electron-builder requires
// the same location as an explicit configuration option.
if (process.env.electron_config_cache) builderArgs.push(`-c.electronDownload.cache=${process.env.electron_config_cache}`);
await run(process.execPath, builderArgs);
await access(path.join(staging, 'JaxOS.exe'));
await access(path.join(staging, 'resources', 'app.asar'));
const archivePath = path.join(staging, 'resources', 'app.asar');
const archivedManifest = JSON.parse(extractFile(archivePath, 'package.json').toString());
if (archivedManifest.version !== version) throw new Error('Archived application version does not match the installer.');
for (const file of ['dist-electron/eval.cjs', 'dist-electron/service-host.cjs', 'dist-electron/llama-host.cjs',
  'evaluation/fixtures.json', 'evaluation/heldout.json', 'evaluation/llama.json']) {
  if (!extractFile(archivePath, file).equals(await readFile(path.join(root, file)))) {
    throw new Error(`Evaluation payload differs from the built source: ${file}`);
  }
}
// The command wrapper runs the bundled evaluator with Electron's Node runtime.
// Keep it outside ASAR so cmd.exe can execute it from the installed directory.
await copyFile(path.join(root, 'build', 'evaluate.cmd'), path.join(staging, 'evaluate.cmd'));

// Pin the checksum-verified compiler bundle from the pinned electron-builder.
// Compile the uninstaller into the setup program, writing it on installation.
// This avoids Wine and does not bypass executable signing verification.
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows.js');
const compiler = await getMakeNsisPath('1.2.1');
let compilerPath = compiler.path;
const compilerEnv = { ...compiler.env };
if (process.platform === 'win32' && compilerPath.toLowerCase().endsWith('.cmd')) {
  compilerEnv.NSISDIR = path.join(path.dirname(compilerPath), 'windows');
  compilerPath = path.join(compilerEnv.NSISDIR, 'makensis.exe');
}
await access(compilerPath);
const prefix = process.platform === 'win32' ? '/' : '-';
await Promise.all([installer, path.join(release, 'SHA256SUMS'), path.join(release, 'windows-build-receipt.json')]
  .map(file => rm(file, { force: true })));
await run(compilerPath, [
  `${prefix}V3`,
  `${prefix}DAPP_VERSION=${version}`,
  `${prefix}DAPP_SOURCE=${staging}`,
  `${prefix}DINSTALLER_OUTPUT=${installer}`,
  path.join(root, 'build', 'installer.nsi'),
], compilerEnv);

const bytes = await readFile(installer);
if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error('Installer lacks Windows executable header.');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const appArchiveSha256 = createHash('sha256').update(await readFile(path.join(staging, 'resources', 'app.asar'))).digest('hex');
await writeFile(path.join(release, 'SHA256SUMS'), `${sha256}  ${path.basename(installer)}\n`);
await writeFile(path.join(release, 'windows-build-receipt.json'), `${JSON.stringify({
  product: 'JaxOS', version, builtAt: new Date().toISOString(),
  artifact: path.basename(installer), bytes: (await stat(installer)).size, sha256, appArchiveSha256,
  hostPlatform: process.platform, target: 'win32-x64',
  electron: manifest.devDependencies.electron,
  electronBuilder: manifest.devDependencies['electron-builder'],
  evaluation: { command: 'evaluate.cmd', bundledEntry: 'resources/app.asar/dist-electron/eval.cjs',
    wrapperSha256: createHash('sha256').update(await readFile(path.join(staging, 'evaluate.cmd'))).digest('hex') },
  nsisToolset: '1.2.1', signed: false,
  nativeWindowsValidated: false,
  note: 'Packaging evidence only. Run the Windows acceptance checks before relying on this release.',
}, null, 2)}\n`);
console.log(`Created unsigned personal installer: ${installer}\nSHA256: ${sha256}`);
