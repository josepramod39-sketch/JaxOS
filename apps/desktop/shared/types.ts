export type Mode = 'brainstorm' | 'daily' | 'build' | 'test';
export type ProviderKind = 'ollama' | 'llamacpp';
export type WorkflowStage = 'analysis' | 'plan' | 'design' | 'test' | 'launch';
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown>; }
export interface ToolStep extends ToolCall { status: 'running' | 'complete' | 'error' | 'interrupted'; startedAt: string; finishedAt?: string; result?: string; runId?: string; }
export type RunKind = 'erc' | 'drc' | 'preview' | 'fabrication';
export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  status: 'complete' | 'streaming' | 'cancelled' | 'error';
  reasoning?: string;
  phase?: 'queued' | 'generating';
  finishReason?: string;
  usage?: GenerationUsage;
  inference?: InferenceProfile;
  omittedMessages?: number;
  model?: string;
  provider?: ProviderKind;
  modelSource?: string;
  runtimeVersion?: string;
  effectiveContext?: number;
  stage?: WorkflowStage;
  toolSteps?: ToolStep[];
}
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  messages: Message[];
  stage?: WorkflowStage;
}
export interface Project {
  id: string;
  name: string;
  path: string;
  projectFile?: string;
  schematic?: string;
  board?: string;
  fingerprint: string;
  goal: string;
  notes: string;
  checks: string[];
  connectedAt: string;
  refreshedAt: string;
}
export interface Finding {
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
  location?: string;
  excluded?: boolean;
}
export interface Artifact {
  id: string;
  name: string;
  path: string;
  mime: string;
  bytes: number;
}
export interface Run {
  id: string;
  projectId: string;
  kind: RunKind;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  inputFingerprint: string;
  stale: boolean;
  toolVersion: string;
  command: string[];
  exitCode: number | null;
  summary: string;
  log: string;
  findings: Finding[];
  artifacts: Artifact[];
  error?: string;
}
export interface DailyItem { id: string; text: string; done: boolean; createdAt: string; }
export interface InferenceProfile {
  contextTokens: number;
  outputTokens: number;
  thinking: 'auto' | 'off' | 'on';
  temperature: number;
  keepAliveSeconds: number;
  gpu: 'auto' | 'cpu';
}
export interface GenerationUsage { inputTokens?: number; outputTokens?: number; loadMs?: number; generationMs?: number; }
export interface LlamaConfig { mode: 'managed' | 'external'; url: string; executable?: string; modelPath?: string; gpuLayers: number; threads: number; }
export type SettingsPatch = Partial<Pick<Settings, 'ollamaUrl' | 'model' | 'runInBackground' | 'provider'>> & { llama?: Pick<LlamaConfig, 'mode' | 'url' | 'gpuLayers' | 'threads'> };
export interface Settings { ollamaUrl: string; model: string; kicadPath: string; modelProfiles?: Record<string, InferenceProfile>; runInBackground?: boolean; provider?: ProviderKind; llama?: LlamaConfig; providerModels?: Partial<Record<ProviderKind,string>>; }
export interface ModelOperation {
  id: string; model: string; kind: 'pull' | 'load' | 'unload';
  status: 'running' | 'complete' | 'cancelled' | 'error';
  createdAt: string; finishedAt?: string; summary: string;
  completed?: number; total?: number;
  provider?: ProviderKind;
}
export interface LoadedModel { name: string; size: number; vram?: number; contextTokens?: number; expiresAt?: string; }
export interface ModelDetails { name: string; local: boolean; thinking: boolean; tools: boolean; maxContext?: number; effectiveContext?: number; parameterSize?: string; quantization?: string; lifecycle?: boolean; ready?: boolean; runtimeVersion?: string; source?: string; }
export interface LlamaStatus { running: boolean; owned: boolean; configured: boolean; contextTokens?: number; gpuLayers?: number; version?: string; message: string; }
export interface AppState {
  schemaVersion: 1;
  conversations: Conversation[];
  projects: Project[];
  runs: Run[];
  dailyItems: DailyItem[];
  settings: Settings;
  activeConversationId?: string;
  activeProjectId?: string;
  mode: Mode;
  notice?: string;
  modelOperations?: ModelOperation[];
}
export interface ModelInfo { name: string; size?: number; remote?: boolean; }
export interface KiCadStatus { available: boolean; path: string; version?: string; error?: string; }
export interface ArtifactContent { mime: string; encoding: 'utf8' | 'base64'; content: string; }

export interface DesktopApi {
  getServiceStatus(): Promise<import('./service-contract').ServiceStatus>;
  restartService(): Promise<AppState>;
  onServiceStatus(listener: (status: import('./service-contract').ServiceStatus) => void): () => void;
  getState(): Promise<AppState>;
  createConversation(projectId?: string): Promise<Conversation>;
  selectConversation(id: string): Promise<void>;
  sendMessage(input: { conversationId: string; text: string; commandId?: string }): Promise<void>;
  cancelChat(conversationId: string): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  inspectModel(name: string): Promise<ModelDetails>;
  listLoadedModels(): Promise<LoadedModel[]>;
  startModelOperation(input: { model: string; kind: ModelOperation['kind']; commandId?: string }): Promise<ModelOperation>;
  cancelModelOperation(id: string): Promise<void>;
  saveModelProfile(input: { model: string; profile: InferenceProfile }): Promise<void>;
  saveSettings(patch: SettingsPatch): Promise<void>;
  chooseLlamaFile(kind: 'executable' | 'modelPath'): Promise<void>;
  getLlamaStatus(): Promise<LlamaStatus>;
  setLlamaSessionKey(key: string): Promise<void>;
  setConversationStage(id: string, stage: WorkflowStage): Promise<void>;
  chooseKiCad(): Promise<KiCadStatus>;
  getKiCadStatus(): Promise<KiCadStatus>;
  chooseProject(): Promise<Project | null>;
  selectProject(id: string): Promise<void>;
  refreshProject(id: string): Promise<Project>;
  updateProject(id: string, patch: Partial<Pick<Project, 'goal' | 'notes' | 'checks'>>): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  addDailyItem(text: string): Promise<void>;
  toggleDailyItem(id: string): Promise<void>;
  removeDailyItem(id: string): Promise<void>;
  startRun(input: { projectId: string; kind: RunKind; commandId?: string }): Promise<Run>;
  cancelRun(runId: string): Promise<void>;
  readArtifact(input: { runId: string; artifactId: string }): Promise<ArtifactContent>;
  openProjectInKiCad(projectId: string): Promise<void>;
  exportRun(runId: string): Promise<string | null>;
  openDataFolder(): Promise<void>;
  getStorageInfo(): Promise<import('./persistence').StorageInfo>;
  searchHistory(input: { query: string; limit?: number }): Promise<import('./persistence').HistorySearch>;
  listTasks(input?: { limit?: number }): Promise<import('./persistence').StoredTask[]>;
  listEvents(input?: { after?: number; limit?: number }): Promise<import('./persistence').WorkspaceEvent[]>;
  rebuildHistoryIndex(): Promise<import('./persistence').StorageInfo>;
  exportDatabaseBackup(): Promise<string | null>;
  onState(listener: (state: AppState) => void): () => void;
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
}

declare global { interface Window { jaxos: DesktopApi; } }
