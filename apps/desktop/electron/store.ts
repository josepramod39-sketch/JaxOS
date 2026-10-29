import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AppState } from '../shared/types';
import { validateModel, validateOllamaUrl } from './ollama';
import { STAGES, validateLlamaConfig } from '../shared/provider-settings';
import { validateLlamaModel } from './llama-http';
import { validateProfile } from '../shared/model-profile';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MODES = ['brainstorm', 'daily', 'build', 'test'];
export function defaultState(): AppState {
  return {
    schemaVersion: 1, conversations: [], projects: [], runs: [], dailyItems: [],
    settings: { ollamaUrl: 'http://127.0.0.1:11434', model: 'qwen3:0.6b', kicadPath: '', modelProfiles: {} }, modelOperations: [], mode: 'brainstorm',
  };
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
}
function text(value: unknown, label: string, max = 100_000): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${label}.`);
}
function id(value: unknown, label: string): asserts value is string {
  text(value, label, 100);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`Invalid ${label}.`);
}
function list(value: unknown, label: string, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}.`);
}
function choice(value: unknown, choices: string[], label: string) {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`Invalid ${label}.`);
}
function date(value: unknown, label: string) {
  text(value, label, 40);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label}.`);
}
function flag(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}.`);
}
function unique(values: unknown[], key: string, label: string) {
  const keys = values.map(value => (value as Record<string, unknown>)[key]);
  if (new Set(keys).size !== keys.length) throw new Error(`Duplicate ${label}.`);
}

/** Validate persisted data before trusting it. Schema version changes require explicit migration. */
export function validateState(input: unknown): AppState {
  record(input, 'workspace');
  if (input.schemaVersion !== 1) throw new Error('Unsupported workspace version.');
  choice(input.mode, MODES, 'mode');
  record(input.settings, 'settings');
  validateOllamaUrl(input.settings.ollamaUrl);
  if(input.settings.provider!==undefined)choice(input.settings.provider,['ollama','llamacpp'],'provider');
  (input.settings.provider==='llamacpp'?validateLlamaModel:validateModel)(input.settings.model);
  if(input.settings.llama!==undefined)validateLlamaConfig(input.settings.llama);
  if(input.settings.providerModels!==undefined){record(input.settings.providerModels,'provider models');for(const [key,value] of Object.entries(input.settings.providerModels)){choice(key,['ollama','llamacpp'],'provider model');(key==='llamacpp'?validateLlamaModel:validateModel)(value);}}
  text(input.settings.kicadPath, 'KiCad path', 8192);
  if (input.settings.runInBackground !== undefined) flag(input.settings.runInBackground, 'background preference');
  if (input.settings.modelProfiles !== undefined) {
    record(input.settings.modelProfiles, 'model profiles');
    if (Object.keys(input.settings.modelProfiles).length > 100) throw new Error('Too many model profiles.');
    for (const [key, value] of Object.entries(input.settings.modelProfiles)) { text(key, 'model profile key', 10000); validateProfile(value); }
  }
  if (input.modelOperations !== undefined) {
    list(input.modelOperations, 'model operations', 30);
    for (const item of input.modelOperations) {
      record(item, 'model operation'); id(item.id, 'model operation ID'); if(item.provider!==undefined)choice(item.provider,['ollama','llamacpp'],'operation provider'); (item.provider==='llamacpp'?validateLlamaModel:validateModel)(item.model);
      choice(item.kind, ['pull', 'load', 'unload'], 'model operation kind');
      choice(item.status, ['running', 'complete', 'cancelled', 'error'], 'model operation status');
      date(item.createdAt, 'model operation date'); if (item.finishedAt !== undefined) date(item.finishedAt, 'model operation date');
      text(item.summary, 'model operation summary', 2000);
      for (const key of ['completed', 'total']) if (item[key] !== undefined && (typeof item[key] !== 'number' || !Number.isSafeInteger(item[key]) || (item[key] as number) < 0)) throw new Error('Invalid model download size.');
    }
    unique(input.modelOperations, 'id', 'model operation IDs');
  }
  if (input.notice !== undefined) text(input.notice, 'notice', 2000);
  list(input.conversations, 'conversations', 300);
  for (const conversation of input.conversations) {
    record(conversation, 'conversation'); id(conversation.id, 'conversation ID');
    text(conversation.title, 'conversation title', 200);
    date(conversation.createdAt, 'conversation date'); date(conversation.updatedAt, 'conversation date');
    if (conversation.projectId !== undefined) id(conversation.projectId, 'conversation project');
    if(conversation.stage!==undefined)choice(conversation.stage,STAGES,'conversation stage');
    list(conversation.messages, 'messages', 500);
    for (const message of conversation.messages) {
      record(message, 'message'); id(message.id, 'message ID');
      choice(message.role, ['user', 'assistant'], 'message role');
      choice(message.status, ['complete', 'streaming', 'cancelled', 'error'], 'message status');
      text(message.content, 'message content'); date(message.createdAt, 'message date');
      if (message.reasoning !== undefined) text(message.reasoning, 'reasoning');
      if(message.provider!==undefined)choice(message.provider,['ollama','llamacpp'],'message provider');
      if(message.stage!==undefined)choice(message.stage,STAGES,'message stage');
      if(message.modelSource!==undefined)text(message.modelSource,'model source',8192);
      if(message.runtimeVersion!==undefined)text(message.runtimeVersion,'runtime version',500);
      if(message.effectiveContext!==undefined&&(!Number.isSafeInteger(message.effectiveContext)||Number(message.effectiveContext)<=0))throw new Error('Invalid effective context.');
      if(message.toolSteps!==undefined){
        list(message.toolSteps,'tool steps',6);
        for(const step of message.toolSteps){record(step,'tool step');text(step.id,'tool call ID',200);text(step.name,'tool name',100);record(step.arguments,'tool arguments');if(JSON.stringify(step.arguments).length>20000)throw new Error('Tool arguments too large.');choice(step.status,['running','complete','error','interrupted'],'tool step status');date(step.startedAt,'tool start');if(step.finishedAt!==undefined)date(step.finishedAt,'tool finish');if(step.result!==undefined)text(step.result,'tool result',6000);if(step.runId!==undefined)id(step.runId,'tool run');}
      }
      if (message.model !== undefined) (message.provider==='llamacpp'?validateLlamaModel:validateModel)(message.model);
      if (message.phase !== undefined) choice(message.phase, ['queued', 'generating'], 'generation phase');
      if (message.finishReason !== undefined) text(message.finishReason, 'finish reason', 100);
      if (message.inference !== undefined) validateProfile(message.inference);
      if (message.omittedMessages !== undefined && (typeof message.omittedMessages !== 'number' || !Number.isSafeInteger(message.omittedMessages) || message.omittedMessages < 0)) throw new Error('Invalid context omission count.');
      if (message.usage !== undefined) {
        record(message.usage, 'generation usage');
        for (const value of Object.values(message.usage)) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid generation usage.');
      }
    }
    unique(conversation.messages, 'id', 'message IDs');
  }
  unique(input.conversations, 'id', 'conversation IDs');
  list(input.projects, 'projects', 100);
  for (const project of input.projects) {
    record(project, 'project'); id(project.id, 'project ID'); text(project.name, 'project name', 300);
    text(project.path, 'project path', 8192);
    for (const key of ['projectFile', 'schematic', 'board']) if (project[key] !== undefined) text(project[key], key, 8192);
    text(project.fingerprint, 'project fingerprint', 200);
    text(project.goal, 'project goal', 8000); text(project.notes, 'project notes', 40_000);
    list(project.checks, 'project checks', 100);
    for (const check of project.checks) text(check, 'project check', 1000);
    date(project.connectedAt, 'project date'); date(project.refreshedAt, 'project date');
  }
  unique(input.projects, 'id', 'project IDs');
  list(input.runs, 'runs', 1000);
  for (const run of input.runs) {
    record(run, 'run'); id(run.id, 'run ID'); id(run.projectId, 'run project');
    choice(run.kind, ['erc', 'drc', 'preview', 'fabrication'], 'run kind');
    choice(run.status, ['queued', 'running', 'passed', 'failed', 'error', 'cancelled'], 'run status');
    date(run.createdAt, 'run date');
    for (const key of ['startedAt', 'finishedAt']) if (run[key] !== undefined) date(run[key], key);
    text(run.inputFingerprint, 'run fingerprint', 200); flag(run.stale, 'stale marker');
    text(run.toolVersion, 'tool version', 300);
    list(run.command, 'command', 100);
    for (const arg of run.command) text(arg, 'command argument', 8192);
    if (run.exitCode !== null && (typeof run.exitCode !== 'number' || !Number.isSafeInteger(run.exitCode))) throw new Error('Invalid exit code.');
    text(run.summary, 'run summary', 8000); text(run.log, 'run log', 1_000_000);
    if (run.error !== undefined) text(run.error, 'run error', 8000);
    list(run.findings, 'findings', 10_000);
    for (const finding of run.findings) {
      record(finding, 'finding'); choice(finding.severity, ['error', 'warning', 'info'], 'finding severity');
      text(finding.message, 'finding message', 10_000);
      for (const key of ['rule', 'location']) if (finding[key] !== undefined) text(finding[key], key, 8192);
      if (finding.excluded !== undefined) flag(finding.excluded, 'exclusion');
    }
    list(run.artifacts, 'artifacts', 2000);
    for (const artifact of run.artifacts) {
      record(artifact, 'artifact'); id(artifact.id, 'artifact ID'); text(artifact.name, 'artifact name', 1000);
      text(artifact.path, 'artifact path', 8192); text(artifact.mime, 'artifact MIME', 200);
      if (typeof artifact.bytes !== 'number' || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) throw new Error('Invalid artifact size.');
    }
    unique(run.artifacts, 'id', 'artifact IDs');
  }
  unique(input.runs, 'id', 'run IDs');
  list(input.dailyItems, 'daily items', 1000);
  for (const item of input.dailyItems) {
    record(item, 'daily item'); id(item.id, 'daily item ID'); text(item.text, 'daily item text', 2000);
    flag(item.done, 'daily item status'); date(item.createdAt, 'daily item date');
  }
  unique(input.dailyItems, 'id', 'daily item IDs');
  const projectIds = new Set(input.projects.map(p => (p as { id: string }).id));
  for (const conv of input.conversations as unknown as AppState['conversations']) {
    if (conv.projectId && !projectIds.has(conv.projectId)) throw new Error('Conversation references a missing project.');
  }
  for (const run of input.runs as unknown as AppState['runs']) if (!projectIds.has(run.projectId)) throw new Error('Run references a missing project.');
  if (input.activeProjectId !== undefined && !projectIds.has(input.activeProjectId as string)) throw new Error('Active project is missing.');
  if (input.activeConversationId !== undefined && !input.conversations.some(c => (c as { id: unknown }).id === input.activeConversationId)) throw new Error('Active conversation is missing.');
  return structuredClone(input) as unknown as AppState;
}

function isMissing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }

export class WorkspaceStore {
  readonly file: string;
  readonly backupFile: string;
  private queue: Promise<void> = Promise.resolve();
  private loaded = false;
  constructor(readonly dataDir: string) {
    this.file = path.join(dataDir, 'workspace.json');
    this.backupFile = `${this.file}.bak`;
  }

  private async read(file: string): Promise<AppState> {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Workspace file exceeds its size limit or is not a file.');
    return validateState(JSON.parse(await readFile(file, 'utf8')));
  }

  async load(): Promise<AppState> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    let primaryError: unknown;
    try { const value = await this.read(this.file); this.loaded = true; return value; } catch (error) { primaryError = error; }
    try {
      const backup = await this.read(this.backupFile);
      if (!isMissing(primaryError)) await rename(this.file, `${this.file}.corrupt-${Date.now()}-${randomUUID()}`);
      this.loaded = true;
      backup.notice = 'Recovered the last saved backup. The unreadable workspace file was preserved for inspection.';
      await this.save(backup);
      return backup;
    } catch (backupError) {
      if (isMissing(primaryError) && isMissing(backupError)) {
        this.loaded = true;
        const state = defaultState();
        await this.save(state);
        return state;
      }
      throw new Error('The saved workspace could not be read. Its files have been preserved. Restore workspace.json from a valid backup before retrying.');
    }
  }

  save(state: AppState): Promise<void> {
    if (!this.loaded) return Promise.reject(new Error('Workspace must load successfully before saving.'));
    const validated = validateState(state);
    const content = `${JSON.stringify(validated, null, 2)}\n`;
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) return Promise.reject(new Error('Workspace is full (32 MB). Export or archive old work before adding more.'));
    const operation = this.queue.catch(() => {}).then(async () => {
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      const backupTemporary = `${this.backupFile}.${randomUUID()}.tmp`;
      try {
        const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        // Validate the previous primary before allowing it to replace a good backup.
        try {
          const previous = await this.read(this.file);
          const backupHandle = await open(backupTemporary, 'wx', 0o600);
          try { await backupHandle.writeFile(`${JSON.stringify(previous, null, 2)}\n`); await backupHandle.sync(); } finally { await backupHandle.close(); }
          await rename(backupTemporary, this.backupFile);
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
        await rename(temporary, this.file);
      } finally {
        await unlink(temporary).catch(() => {});
        await unlink(backupTemporary).catch(() => {});
      }
    });
    this.queue = operation;
    return operation;
  }

  async flush(): Promise<void> { await this.queue; }
}
