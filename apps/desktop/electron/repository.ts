import type { AppState } from '../shared/types';
import type { CommandReceipt, HistorySearch, StorageInfo, StoredTask, WorkspaceEvent } from '../shared/persistence';

export interface WorkspaceRepository {
  load(): Promise<AppState>;
  save(state: AppState, receipt?: CommandReceipt): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
  getCommand(id: string): CommandReceipt | undefined;
  search(query: string, limit?: number): HistorySearch;
  events(after?: number, limit?: number): WorkspaceEvent[];
  tasks(limit?: number): StoredTask[];
  info(): StorageInfo;
  backupTo(destination: string): Promise<void>;
  rebuildSearch(): void;
}
