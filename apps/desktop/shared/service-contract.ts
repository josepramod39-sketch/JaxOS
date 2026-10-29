import type { AppService } from '../electron/service';
import type { AppState } from './types';

export const SERVICE_PROTOCOL = 1;
export const SERVICE_METHODS = [
  'getState', 'createConversation', 'selectConversation', 'sendMessage', 'cancelChat',
  'listModels', 'saveSettings', 'getKiCadStatus', 'setKiCadPath', 'importProject',
  'selectProject', 'refreshProject', 'updateProject', 'setMode', 'addDailyItem',
  'toggleDailyItem', 'removeDailyItem', 'startRun', 'cancelRun', 'readArtifact',
  'getProject', 'getRun', 'getArtifactPath',
  'inspectModel', 'listLoadedModels', 'startModelOperation', 'cancelModelOperation', 'saveModelProfile',
  'getLlamaStatus', 'setLlamaFile', 'setLlamaSessionKey', 'setConversationStage',
  'getStorageInfo', 'searchHistory', 'listTasks', 'listEvents', 'rebuildHistoryIndex', 'backupDatabase',
] as const;
export type ServiceMethod = typeof SERVICE_METHODS[number];
type Methods = Pick<AppService, ServiceMethod>;
export type RemoteService = { [K in ServiceMethod]: (...args: Parameters<Methods[K]>) => Promise<Awaited<ReturnType<Methods[K]>>> };
export interface ServiceStatus { connected: boolean; message: string; }
export interface ServiceRequest { protocol: 1; id: string; method: ServiceMethod | 'shutdown'; args: unknown[]; }
export type ServiceMessage =
  | { protocol: 1; type: 'ready' }
  | { protocol: 1; type: 'state'; sequence: number; state: AppState }
  | { protocol: 1; type: 'result'; id: string; result?: unknown; error?: string }
  | { protocol: 1; type: 'fatal'; error: string };

export interface ServiceWire {
  send(message: ServiceRequest): void;
  onMessage(callback: (message: ServiceMessage) => void): void;
  onExit(callback: () => void): void;
  kill(): void;
}
