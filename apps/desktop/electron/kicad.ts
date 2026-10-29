import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Artifact, Finding, KiCadStatus, Project, Run } from '../shared/types';

const MAX_FILES = 2_000;
const MAX_ENTRIES = 12_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_PROJECT_BYTES = 128 * 1024 * 1024;
const MAX_LOG_BYTES = 256 * 1024;
const MAX_FINDINGS = 10_000;
const COMMAND_TIMEOUT_MS = 120_000;
const SOURCE_EXTENSIONS = new Set(['.kicad_pro', '.kicad_sch', '.kicad_pcb', '.kicad_dru', '.kicad_sym', '.kicad_mod', '.kicad_wks', '.sch', '.lib', '.dcm', '.pro', '.png', '.jpg', '.jpeg', '.svg']);
const SKIP_DIRECTORIES = new Set(['.git', '.svn', 'node_modules', 'dist', 'dist-electron', 'release', '.venv', '__pycache__']);
const SOURCE_TABLES = new Set(['sym-lib-table', 'fp-lib-table']);
const now = () => new Date().toISOString();
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const within = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
const slash = (value: string) => value.split(path.sep).join('/');
const limitLog = (value: string) => value.length > MAX_LOG_BYTES ? `[Earlier log output truncated]\n${value.slice(-MAX_LOG_BYTES)}` : value;

interface InputFile { relative: string; data: Buffer; }
interface CommandResult { command: string[]; exitCode: number | null; stdout: string; stderr: string; }
interface CommandRecord extends CommandResult { startedAt: string; finishedAt: string; }
class CommandError extends Error {
  constructor(message: string, readonly result: CommandResult) { super(message); }
}
export interface ExecuteKiCadOptions {
  project: Project;
  run: Run;
  executable: string;
  dataDir: string;
  signal?: AbortSignal;
  onUpdate?: (patch: Partial<Run>) => void;
}

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Run cancelled.');
}

async function canonicalFile(root: string, candidate: string): Promise<string> {
  const resolved = path.resolve(candidate);
  if (!within(root, resolved)) throw new Error('Project file is outside the selected project directory.');
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Project files must be regular files, not symbolic links.');
  const real = await fs.realpath(resolved);
  if (!within(root, real)) throw new Error('Project file resolves outside the selected directory.');
  return real;
}

async function collectInputs(root: string, signal?: AbortSignal): Promise<InputFile[]> {
  const files: InputFile[] = [];
  let bytes = 0;
  let entries = 0;
  async function visit(directory: string, depth: number) {
    aborted(signal);
    if (depth > 16) throw new Error('Project has too many nested directories; select a smaller KiCad project folder.');
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++entries > MAX_ENTRIES) throw new Error('Project folder is too large; select a dedicated KiCad project folder.');
      if (entry.isDirectory() && (SKIP_DIRECTORIES.has(entry.name) || entry.name.endsWith('-backups'))) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Project contains a symbolic link: ${slash(path.relative(root, filename))}. Use a project with local regular files.`);
      if (entry.isDirectory()) { await visit(filename, depth + 1); continue; }
      if (!entry.isFile() || (!SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && !SOURCE_TABLES.has(entry.name))) continue;
      if (files.length >= MAX_FILES) throw new Error(`Project exceeds the ${MAX_FILES}-file snapshot limit.`);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || !within(root, await fs.realpath(filename))) throw new Error('Project changed while reading its files.');
      if (stat.size > MAX_FILE_BYTES || bytes + stat.size > MAX_PROJECT_BYTES) throw new Error('KiCad project exceeds the snapshot size limit (32 MB per file, 128 MB total).');
      const data = await fs.readFile(filename);
      if (data.length > MAX_FILE_BYTES || bytes + data.length > MAX_PROJECT_BYTES) throw new Error('KiCad project exceeds the snapshot size limit.');
      bytes += data.length;
      files.push({ relative: slash(path.relative(root, filename)), data });
    }
  }
  await visit(root, 0);
  return files.sort((a, b) => a.relative.localeCompare(b.relative, 'en'));
}

function fingerprint(files: InputFile[]): string {
  const hash = createHash('sha256');
  for (const file of files) hash.update(file.relative).update('\0').update(sha256(file.data)).update('\n');
  return hash.digest('hex');
}

export async function fingerprintProject(project: Project): Promise<string> {
  const root = await fs.realpath(project.path);
  return fingerprint(await collectInputs(root));
}

export async function inspectProject(inputPath: string): Promise<Project> {
  if (!inputPath || inputPath.includes('\0')) throw new Error('Select a KiCad project file or folder.');
  const selected = path.resolve(inputPath);
  const stat = await fs.lstat(selected);
  if (stat.isSymbolicLink()) throw new Error('Select the original project folder or file instead of a symbolic link.');
  if (!stat.isDirectory() && (!stat.isFile() || path.extname(selected).toLowerCase() !== '.kicad_pro')) throw new Error('Select a .kicad_pro file or its containing folder.');
  const root = await fs.realpath(stat.isDirectory() ? selected : path.dirname(selected));
  const entries = await fs.readdir(root, { withFileTypes: true });
  let projectFile = stat.isFile() ? await canonicalFile(root, selected) : undefined;
  const projectNames = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.kicad_pro')).map(e => e.name);
  if (!projectFile && projectNames.length > 1) throw new Error('This folder has multiple KiCad projects. Select the specific .kicad_pro file.');
  if (!projectFile && projectNames.length === 1) projectFile = await canonicalFile(root, path.join(root, projectNames[0]));
  const base = projectFile ? path.basename(projectFile, path.extname(projectFile)) : undefined;
  async function findFile(extension: string) {
    const names = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith(extension)).map(e => e.name);
    const match = base ? names.find(name => name === `${base}${extension}`) : names.length === 1 ? names[0] : undefined;
    if (!base && names.length > 1) throw new Error(`This folder has multiple ${extension} files. Select a .kicad_pro file.`);
    return match ? canonicalFile(root, path.join(root, match)) : undefined;
  }
  const schematic = await findFile('.kicad_sch');
  const board = await findFile('.kicad_pcb');
  if (!schematic && !board) throw new Error('No matching KiCad schematic or PCB was found beside this project.');
  const project: Project = { id: randomUUID(), name: base ?? path.basename(root), path: root, projectFile, schematic, board, fingerprint: '', goal: '', notes: '', checks: [], connectedAt: now(), refreshedAt: now() };
  project.fingerprint = await fingerprintProject(project);
  return project;
}

async function runProcess(executable: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeout?: number; onOutput?: (text: string) => void } = {}): Promise<CommandResult> {
  aborted(options.signal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let reason: string | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    function stop(message: string) {
      reason = message;
      child.kill();
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1_000);
      killTimer.unref();
    }
    const cancel = () => stop('Run cancelled.');
    const timer = setTimeout(() => stop('KiCad command exceeded the 120-second time limit.'), options.timeout ?? COMMAND_TIMEOUT_MS);
    timer.unref();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    function cleanup() {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', cancel);
    }
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text: string) => { stdout = limitLog(stdout + text); options.onOutput?.(text); });
    child.stderr.on('data', (text: string) => { stderr = limitLog(stderr + text); options.onOutput?.(text); });
    child.on('error', error => { if (settled) return; settled = true; cleanup(); reject(new CommandError(`Could not start KiCad: ${error.message}`, { command: [executable, ...args], exitCode: null, stdout, stderr })); });
    child.on('close', code => {
      if (settled) return; settled = true; cleanup();
      if (reason) reject(new CommandError(reason, { command: [executable, ...args], exitCode: code, stdout, stderr }));
      else resolve({ command: [executable, ...args], exitCode: code, stdout, stderr });
    });
  });
}

async function runtimeEnvironment(directory: string): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env };
  // Linux cloud workspaces may have a readonly home. Keep KiCad's own files in app data;
  // Windows uses its ordinary KiCad installation/user-library configuration.
  if (process.platform !== 'win32') {
    for (const [key, folder] of [['CONFIG', 'config'], ['CACHE', 'cache'], ['DATA', 'data']] as const) {
      const target = path.join(directory, folder);
      await fs.mkdir(target, { recursive: true });
      env[`XDG_${key}_HOME`] = target;
    }
  }
  return env;
}

export async function detectKiCad(configuredPath?: string): Promise<KiCadStatus> {
  const candidates: string[] = [];
  if (configuredPath?.trim()) candidates.push(configuredPath.trim());
  else {
    candidates.push(process.platform === 'win32' ? 'kicad-cli.exe' : 'kicad-cli');
    if (process.platform === 'win32') {
      for (const parent of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((v): v is string => !!v)) {
        const base = path.join(parent, 'KiCad');
        try { for (const version of (await fs.readdir(base)).sort().reverse()) candidates.push(path.join(base, version, 'bin', 'kicad-cli.exe')); } catch { /* Not installed in this location. */ }
      }
    } else candidates.push('/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', '/usr/bin/kicad-cli');
  }
  let lastError = 'KiCad 9 or newer was not found. Install KiCad or choose kicad-cli in Settings.';
  for (const candidate of candidates) {
    try {
      const config = process.platform !== 'win32' ? await fs.mkdtemp(path.join(os.tmpdir(), 'jaxos-kicad-detect-')) : undefined;
      let result: CommandResult;
      try { result = await runProcess(candidate, ['--version'], { timeout: 10_000, env: config ? await runtimeEnvironment(config) : undefined }); }
      finally { if (config) await fs.rm(config, { recursive: true, force: true }); }
      const version = result.stdout.trim().match(/\b(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?)\b/)?.[1];
      if (result.exitCode !== 0 || !version) throw new Error('KiCad did not return a valid version.');
      if (Number(version.split('.')[0]) < 9) throw new Error(`KiCad ${version} is unsupported. Install KiCad 9 or newer.`);
      // Preserve selected absolute paths; bare PATH commands remain valid spawn executables.
      return { available: true, path: candidate, version };
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
  }
  return { available: false, path: candidates[0] ?? '', error: lastError };
}

export function getKiCadEditorExecutable(cliPath: string): string {
  const name = process.platform === 'win32' ? 'kicad.exe' : 'kicad';
  return path.isAbsolute(cliPath) ? path.join(path.dirname(cliPath), name) : name;
}

function decodeString(value: string): string {
  return value.replace(/\\([\\"])/g, '$1');
}

function validateAndRewriteReferences(file: InputFile, root: string, snapshot: string, filenames: Set<string>): Buffer {
  const extension = path.extname(file.relative).toLowerCase();
  if (!SOURCE_TABLES.has(path.basename(file.relative)) && !['.kicad_sch', '.kicad_pro'].includes(extension)) return file.data;
  let text = file.data.toString('utf8');
  function reference(raw: string, table: boolean): string {
    const value = decodeString(raw);
    if (!value || (table && /^\$\{KICAD\d+_(?:SYMBOL|FOOTPRINT|TEMPLATE|3DMODEL)_DIR\}(?:[\\/]|$)/.test(value))) return raw;
    if (/^[a-z]+:\/\//i.test(value)) throw new Error(`Remote library references cannot be snapshotted: ${file.relative}`);
    const expanded = value.replace(/\$\{KIPRJMOD\}/g, root);
    if (/\$\{|\$\(|%\w+%/.test(expanded)) throw new Error(`Unresolved project dependency in ${file.relative}: ${value}`);
    const resolved = path.resolve(path.dirname(path.join(root, file.relative)), expanded);
    if (!within(root, resolved)) throw new Error(`Project dependency is outside the selected folder: ${value}. Copy the dependency into the project first.`);
    const relative = slash(path.relative(root, resolved));
    if (!filenames.has(relative) && ![...filenames].some(name => name.startsWith(`${relative}/`))) throw new Error(`Project dependency is missing from the snapshot: ${value}`);
    if (path.isAbsolute(expanded) && !value.includes('${KIPRJMOD}')) return slash(path.join(snapshot, relative)).replace(/"/g, '\\"');
    return raw;
  }
  if (SOURCE_TABLES.has(path.basename(file.relative))) {
    text = text.replace(/\(uri\s+"((?:\\.|[^"\\])*)"\)/g, (_match, value: string) => `(uri "${reference(value, true)}")`);
    if (/\(type\s+"(?:Github|HTTP|Database)"\)/i.test(text)) throw new Error('Remote and database-backed KiCad libraries are not supported by project snapshots.');
  }
  if (extension === '.kicad_sch') text = text.replace(/(\(property\s+"(?:Sheetfile|Sheet file)"\s+)"((?:\\.|[^"\\])*)"/gi, (_match, prefix: string, value: string) => `${prefix}"${reference(value, false)}"`);
  if (extension === '.kicad_pro') {
    // Custom worksheets can read external files; only project-contained ones are snapshotted.
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new Error(`Invalid project JSON: ${file.relative}`); }
    function walk(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (key === 'page_layout_descr_file' && typeof item === 'string' && item) (value as Record<string, unknown>)[key] = reference(item, true);
        else walk(item);
      }
    }
    walk(json); text = JSON.stringify(json, null, 2);
  }
  return Buffer.from(text);
}

export function parseKiCadFindings(report: unknown, kind: 'erc' | 'drc'): Finding[] {
  if (!report || typeof report !== 'object') throw new Error('KiCad produced an invalid check report.');
  const data = report as Record<string, unknown>;
  const raw: unknown[] = [];
  if (kind === 'erc') {
    if (!Array.isArray(data.sheets)) throw new Error('KiCad ERC report has no sheets array.');
    for (const sheet of data.sheets) {
      if (!sheet || !Array.isArray(sheet.violations)) throw new Error('KiCad ERC report has an invalid sheet.');
      raw.push(...sheet.violations);
    }
  } else {
    for (const name of ['violations', 'unconnected_items', 'schematic_parity']) {
      if (!Array.isArray(data[name])) throw new Error(`KiCad DRC report has no ${name} array.`);
      raw.push(...data[name]);
    }
  }
  if (raw.length > MAX_FINDINGS) throw new Error('KiCad report exceeds the findings limit.');
  return raw.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid finding in KiCad report.');
    const finding = item as Record<string, unknown>;
    if (typeof finding.description !== 'string' || typeof finding.severity !== 'string') throw new Error('Incomplete finding in KiCad report.');
    const locations = Array.isArray(finding.items) ? finding.items.map(i => typeof i?.description === 'string' ? i.description : '').filter(Boolean) : [];
    return {
      severity: finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info',
      message: finding.description.slice(0, 4_000),
      rule: typeof finding.type === 'string' ? finding.type : undefined,
      // Use component descriptions. KiCad 9.0.2 ERC JSON has inconsistent coordinate scaling.
      location: locations.join('; ').slice(0, 4_000) || undefined,
      excluded: finding.excluded === true,
    };
  });
}

export function copperLayerNames(board: string): string[] {
  const section = board.match(/\(layers\s+([\s\S]*?)\n\s*\)/)?.[1];
  if (!section) throw new Error('Cannot determine the PCB copper layer stack.');
  const names = [...section.matchAll(/\(\d+\s+"((?:F|B|In\d+)\.Cu)"\s+(?:signal|power|mixed)/g)].map(match => match[1]);
  if (names.length < 2 || !names.includes('F.Cu') || !names.includes('B.Cu') || names.length > 32 || new Set(names).size !== names.length) throw new Error('PCB has an unsupported or incomplete copper layer stack.');
  return names;
}

function validateCsv(data: Buffer, headers: string[], placement = false): void {
  const text = data.toString('utf8').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(field); field = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field); if (row.some(cell => cell.length)) rows.push(row); row = []; field = '';
    } else field += character;
  }
  if (quoted) throw new Error('KiCad CSV contains an unterminated quoted field.');
  if (row.length || field.length) { row.push(field); rows.push(row); }
  if (!rows.length || rows[0].join('|') !== headers.join('|') || rows.some(row => row.length !== headers.length)) throw new Error('KiCad CSV export has invalid column headers or rows.');
  if (placement && rows.slice(1).some(row => [3, 4, 5].some(index => row[index] === '' || !Number.isFinite(Number(row[index]))) || !['top', 'bottom'].includes(row[6]))) throw new Error('KiCad placement CSV has invalid positions or board sides.');
}

async function regularOutput(outputRoot: string, filename: string): Promise<Buffer> {
  if (!within(outputRoot, filename)) throw new Error('KiCad output is outside the run directory.');
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES || !within(outputRoot, await fs.realpath(filename))) throw new Error('KiCad output is not a safe regular file or exceeds 32 MB.');
  return fs.readFile(filename);
}

export async function executeKiCad(options: ExecuteKiCadOptions): Promise<Run> {
  const { project, executable, dataDir, signal } = options;
  let run: Run = { ...options.run, findings: [], artifacts: [], startedAt: now(), status: 'running', log: '', error: undefined };
  const commands: CommandRecord[] = [];
  let runRoot = '';
  let outputRoot = '';
  let sourceFiles: InputFile[] = [];
  const snapshotHashes = new Map<string, string>();
  const notify = (patch: Partial<Run>) => { run = { ...run, ...patch }; options.onUpdate?.(patch); };
  const log = (value: string) => notify({ log: limitLog(run.log + value) });
  async function addArtifact(filename: string, mime: string) {
    const data = await regularOutput(outputRoot, filename);
    const artifact: Artifact = { id: randomUUID(), name: path.basename(filename), path: filename, mime, bytes: data.length };
    notify({ artifacts: [...run.artifacts, artifact] });
    return data;
  }
  try {
    aborted(signal);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(run.id)) throw new Error('Invalid run identifier.');
    if (run.projectId !== project.id) throw new Error('Run does not belong to this project.');
    const root = await fs.realpath(project.path);
    const dataRoot = path.resolve(dataDir);
    if (within(root, dataRoot)) throw new Error('Application data must be outside the KiCad project folder.');
    await fs.mkdir(path.join(dataRoot, 'runs'), { recursive: true });
    const canonicalRuns = await fs.realpath(path.join(dataRoot, 'runs'));
    if (!within(await fs.realpath(dataRoot), canonicalRuns)) throw new Error('Run storage resolves outside application data.');
    runRoot = path.join(canonicalRuns, run.id);
    await fs.mkdir(runRoot); // Exclusive: never reuse an old report or overwrite another run.
    const snapshot = path.join(runRoot, 'input'); outputRoot = path.join(runRoot, 'output');
    await fs.mkdir(snapshot); await fs.mkdir(outputRoot);
    notify({ status: 'running', startedAt: run.startedAt, log: '', artifacts: [], findings: [] });
    sourceFiles = await collectInputs(root, signal);
    const inputFingerprint = fingerprint(sourceFiles);
    const names = new Set(sourceFiles.map(file => file.relative));
    for (const file of sourceFiles) {
      aborted(signal);
      const destination = path.join(snapshot, file.relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const captured = validateAndRewriteReferences(file, root, snapshot, names);
      snapshotHashes.set(file.relative, sha256(captured));
      await fs.writeFile(destination, captured, { flag: 'wx' });
    }
    if (await fingerprintProject(project) !== inputFingerprint) throw new Error('Project changed while its snapshot was being created. Save it and run again.');
    notify({ inputFingerprint, stale: false });
    async function source(filename: string | undefined, label: string) {
      if (!filename) throw new Error(`This project has no ${label}.`);
      const canonical = await canonicalFile(root, filename);
      const relative = slash(path.relative(root, canonical));
      if (!names.has(relative)) throw new Error(`${label} was not captured in the project snapshot.`);
      return path.join(snapshot, relative);
    }
    const env = await runtimeEnvironment(path.join(runRoot, 'runtime'));
    async function command(args: string[], checkHelp = false) {
      aborted(signal);
      const startedAt = now();
      if (!checkHelp) { notify({ command: [executable, ...args] }); log(`\n$ ${[executable, ...args].map(part => JSON.stringify(part)).join(' ')}\n`); }
      let result: CommandResult;
      try { result = await runProcess(executable, args, { cwd: snapshot, env, signal, timeout: checkHelp ? 10_000 : COMMAND_TIMEOUT_MS, onOutput: checkHelp ? undefined : log }); }
      catch (error) {
        if (error instanceof CommandError) {
          commands.push({ ...error.result, startedAt, finishedAt: now() });
          if (!checkHelp) notify({ exitCode: error.result.exitCode });
        }
        throw error;
      }
      commands.push({ ...result, startedAt, finishedAt: now() });
      if (!checkHelp) notify({ exitCode: result.exitCode });
      return result;
    }
    const versionResult = await command(['--version']);
    const version = versionResult.stdout.trim().match(/\b(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?)\b/)?.[1];
    if (versionResult.exitCode !== 0 || !version || Number(version.split('.')[0]) < 9) throw new Error('KiCad 9 or newer is required for supported JSON checks and exports.');
    notify({ toolVersion: version });
    if (process.platform !== 'win32') {
      const tableDirectory = path.join(env.XDG_CONFIG_HOME!, 'kicad', `${version.split('.')[0]}.0`);
      await fs.mkdir(tableDirectory, { recursive: true });
      for (const table of SOURCE_TABLES) {
        try { await fs.copyFile(path.join('/usr/share/kicad/template', table), path.join(tableDirectory, table)); }
        catch { /* Packaged KiCad defaults are optional; project-local tables remain available. */ }
      }
    }
    async function capability(args: string[], flags: string[]) {
      const help = await command([...args, '--help'], true);
      const text = help.stdout + help.stderr;
      if (![0, 1].includes(help.exitCode ?? -1) || flags.some(flag => !text.includes(flag))) throw new Error(`Installed KiCad does not support required options for ${args.join(' ')}.`);
    }
    async function check(kind: 'erc' | 'drc', parity = false) {
      const type = kind === 'erc' ? 'sch' : 'pcb';
      const input = await source(kind === 'erc' ? project.schematic : project.board, kind === 'erc' ? 'schematic' : 'PCB');
      await capability([type, kind], ['--format', '--exit-code-violations', ...(parity ? ['--schematic-parity'] : [])]);
      const reportFile = path.join(outputRoot, `${kind}.json`);
      const result = await command([type, kind, '--format', 'json', '--exit-code-violations', ...(parity ? ['--schematic-parity'] : []), '-o', reportFile, input]);
      if (result.exitCode !== 0 && result.exitCode !== 5) throw new Error(`KiCad ${kind.toUpperCase()} exited with code ${result.exitCode}. Check the command log.`);
      const content = await addArtifact(reportFile, 'application/json');
      let report: unknown;
      try { report = JSON.parse(content.toString('utf8')); } catch { throw new Error(`KiCad ${kind.toUpperCase()} did not produce valid JSON.`); }
      const findings = parseKiCadFindings(report, kind);
      if (run.findings.length + findings.length > MAX_FINDINGS) throw new Error('Combined check results exceed 10,000 findings.');
      notify({ findings: [...run.findings, ...findings] });
      if (result.exitCode === 5 && findings.filter(f => !f.excluded).length === 0) throw new Error('KiCad reported violations but its report contained none. This run cannot be marked passed.');
      return findings.some(f => !f.excluded);
    }
    if (run.kind === 'erc' || run.kind === 'drc') {
      const failed = await check(run.kind, run.kind === 'drc' && !!project.schematic);
      notify({ status: failed ? 'failed' : 'passed', summary: failed ? `${run.findings.length} ${run.kind.toUpperCase()} finding${run.findings.length === 1 ? '' : 's'} require review.` : `${run.kind.toUpperCase()} completed with no reported violations.` });
    } else if (run.kind === 'preview') {
      let count = 0;
      if (project.schematic) {
        await capability(['sch', 'export', 'svg'], ['--exclude-drawing-sheet', '--output']);
        const directory = path.join(outputRoot, 'schematic'); await fs.mkdir(directory);
        const result = await command(['sch', 'export', 'svg', '--exclude-drawing-sheet', '-o', directory + path.sep, await source(project.schematic, 'schematic')]);
        if (result.exitCode !== 0) throw new Error('KiCad schematic SVG export failed.');
        const files = await fs.readdir(directory);
        if (files.length === 0 || files.length > 500) throw new Error('KiCad schematic export produced no previews or exceeded 500 sheets.');
        for (const filename of files) {
          if (!filename.toLowerCase().endsWith('.svg')) throw new Error('Unexpected file in the schematic preview output.');
          const content = await regularOutput(outputRoot, path.join(directory, filename));
          if (!/<svg[\s>]/.test(content.toString('utf8')) || !/<(?:path|line|rect|text|circle|polygon)[\s>]/.test(content.toString('utf8'))) throw new Error('KiCad returned an invalid or empty SVG preview.');
          await addArtifact(path.join(directory, filename), 'image/svg+xml'); count++;
        }
      }
      if (project.board) {
        await capability(['pcb', 'export', 'svg'], ['--mode-single', '--layers', '--fit-page-to-board', '--exclude-drawing-sheet']);
        const filename = path.join(outputRoot, 'pcb.svg');
        const result = await command(['pcb', 'export', 'svg', '--mode-single', '--layers', 'F.Cu,B.Cu,F.Silkscreen,Edge.Cuts', '--fit-page-to-board', '--exclude-drawing-sheet', '-o', filename, await source(project.board, 'PCB')]);
        if (result.exitCode !== 0) throw new Error('KiCad PCB SVG export failed.');
        const content = await regularOutput(outputRoot, filename);
        if (!/<svg[\s>]/.test(content.toString('utf8')) || !/<(?:path|line|rect|text|circle|polygon)[\s>]/.test(content.toString('utf8'))) throw new Error('KiCad returned an invalid or empty PCB SVG preview.');
        await addArtifact(filename, 'image/svg+xml'); count++;
      }
      if (!count) throw new Error('Project has no schematic or PCB to preview.');
      notify({ status: 'passed', summary: `${count} saved-file preview${count === 1 ? '' : 's'} generated. No electrical or physical validation was performed.` });
    } else if (run.kind === 'fabrication') {
      if (!project.board) throw new Error('Fabrication exports require a PCB.');
      let failed = project.schematic ? await check('erc') : false;
      failed = (await check('drc', !!project.schematic)) || failed;
      if (failed) notify({ status: 'failed', summary: 'Fabrication export stopped: resolve the reported ERC/DRC findings first.' });
      else {
        const pcb = await source(project.board, 'PCB');
        const copperLayers = copperLayerNames(await fs.readFile(pcb, 'utf8'));
        const requestedLayers = [...copperLayers, 'F.Mask', 'B.Mask', 'F.Silkscreen', 'B.Silkscreen', 'Edge.Cuts'];
        const directory = path.join(outputRoot, 'fabrication'); await fs.mkdir(directory);
        await capability(['pcb', 'export', 'gerbers'], ['--layers', '--output']);
        await capability(['pcb', 'export', 'drill'], ['--format', '--output']);
        await capability(['pcb', 'export', 'pos'], ['--format', '--units', '--side', '--exclude-dnp']);
        if (project.schematic) await capability(['sch', 'export', 'bom'], ['--fields', '--labels', '--field-delimiter', '--string-delimiter', '--exclude-dnp']);
        for (const args of [
          ['pcb', 'export', 'gerbers', '--layers', requestedLayers.join(','), '-o', directory + path.sep, pcb],
          ['pcb', 'export', 'drill', '--format', 'excellon', '-o', directory + path.sep, pcb],
        ]) { const result = await command(args); if (result.exitCode !== 0) throw new Error(`KiCad ${args[2]} export failed.`); }
        const placementFile = path.join(directory, 'placement-mm.csv');
        const placement = await command(['pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--side', 'both', '--exclude-dnp', '-o', placementFile, pcb]);
        if (placement.exitCode !== 0) throw new Error('KiCad placement CSV export failed.');
        validateCsv(await regularOutput(outputRoot, placementFile), ['Ref', 'Val', 'Package', 'PosX', 'PosY', 'Rot', 'Side'], true);
        if (project.schematic) {
          const bomFile = path.join(directory, 'bom.csv');
          const bom = await command(['sch', 'export', 'bom', '--fields', 'Reference,Value,Footprint,${QUANTITY},${DNP}', '--labels', 'Reference,Value,Footprint,Quantity,DNP', '--field-delimiter', ',', '--string-delimiter', '"', '--exclude-dnp', '-o', bomFile, await source(project.schematic, 'schematic')]);
          if (bom.exitCode !== 0) throw new Error('KiCad BOM CSV export failed.');
          validateCsv(await regularOutput(outputRoot, bomFile), ['Reference', 'Value', 'Footprint', 'Quantity', 'DNP']);
        }
        const files = await fs.readdir(directory);
        if (files.length < 8 || files.length > 100 || !files.some(f => f.endsWith('.drl'))) throw new Error('KiCad did not produce the complete requested Gerber and drill set.');
        const needed = requestedLayers.map(layer => layer.replaceAll('.', '_'));
        if (needed.some(layer => !files.some(name => name.includes(layer)))) throw new Error('KiCad manufacturing exports are missing requested layers.');
        for (const filename of files) {
          const file = path.join(directory, filename); const content = await regularOutput(outputRoot, file); const text = content.toString('utf8');
          if (filename.endsWith('.csv')) { await addArtifact(file, 'text/csv'); continue; }
          if (filename.endsWith('.drl') ? !text.includes('M48') || !text.includes('M30') : filename.endsWith('.gbrjob') ? !text.includes('FilesAttributes') : !text.includes('M02*') || !text.includes('%FS')) throw new Error(`Invalid fabrication output: ${filename}`);
          await addArtifact(file, filename.endsWith('.gbrjob') ? 'application/json' : 'text/plain');
        }
        notify({ status: 'passed', summary: project.schematic ? 'Gerbers, drills, BOM and placement CSV exported after ERC, DRC, and schematic parity checks. Placement uses mm and both board sides, including through-hole parts. Review manufacturing requirements before ordering.' : 'Gerbers, drills and placement CSV exported after PCB DRC. No schematic was available for BOM, ERC or parity checks. Placement uses mm and both sides, including through-hole parts; review manufacturing requirements before ordering.' });
      }
    } else throw new Error('Unsupported KiCad operation.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify({ status: signal?.aborted ? 'cancelled' : 'error', error: signal?.aborted ? undefined : message, summary: signal?.aborted ? 'Run cancelled. Incomplete outputs were not accepted as a successful result.' : message });
    log(`\n${signal?.aborted ? 'Cancelled' : 'Error'}: ${message}\n`);
  }
  if (signal?.aborted && run.status !== 'cancelled') notify({ status: 'cancelled', summary: 'Run cancelled. Incomplete outputs were not accepted as a successful result.', error: undefined });
  if (runRoot && outputRoot) {
    try {
      let currentFingerprint: string | undefined;
      try { currentFingerprint = await fingerprintProject(project); } catch { /* Missing source means saved evidence is no longer current. */ }
      notify({ stale: !currentFingerprint || currentFingerprint !== run.inputFingerprint });
      for (const [relative, expected] of snapshotHashes) {
        const captured = await regularOutput(runRoot, path.join(runRoot, 'input', relative));
        if (sha256(captured) !== expected) throw new Error('A captured input changed during the KiCad operation.');
      }
      const filename = path.join(outputRoot, 'run-evidence.json');
      const outputFiles = await Promise.all(run.artifacts.map(async artifact => ({ name: artifact.name, relativePath: slash(path.relative(runRoot, artifact.path)), bytes: artifact.bytes, sha256: sha256(await regularOutput(outputRoot, artifact.path)) })));
      await fs.writeFile(filename, JSON.stringify({ schemaVersion: 1, runId: run.id, projectId: project.id, kind: run.kind, status: run.status, inputFingerprint: run.inputFingerprint, toolVersion: run.toolVersion, startedAt: run.startedAt, finishedAt: now(), commands, inputs: sourceFiles.map(file => ({ path: file.relative, bytes: file.data.length, sha256: sha256(file.data), snapshotSha256: snapshotHashes.get(file.relative) })), outputs: outputFiles, note: 'Checks use saved-file snapshots. Installed KiCad standard libraries are tool dependencies. ERC/DRC are not simulation or physical measurements. Placement CSV uses mm, both board sides, and includes through-hole parts; DNP parts are excluded from BOM/placement exports.' }, null, 2), { flag: 'wx' });
      await addArtifact(filename, 'application/json');
    } catch (error) {
      if (run.status !== 'cancelled') notify({ status: 'error', summary: 'Could not preserve complete run evidence.', error: error instanceof Error ? error.message : String(error) });
    }
  }
  notify({ finishedAt: now() });
  return run;
}
