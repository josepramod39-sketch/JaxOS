export interface SearchHit {
  conversationId: string; messageId: string; title: string; role: 'user' | 'assistant';
  excerpt: string; createdAt: string;
}
export interface HistorySearch { hits: SearchHit[]; engine: 'fts5' | 'basic'; }
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
export interface StoredTask {
  id: string; kind: 'chat' | 'kicad' | 'model'; sourceId: string; conversationId?: string; projectId?: string;
  label: string; status: TaskStatus; createdAt: string; updatedAt: string;
}
export interface WorkspaceEvent { sequence: number; type: string; entityId?: string; createdAt: string; detail: Record<string, unknown>; }
export interface StorageInfo {
  backend: 'sqlite'; version: number; sqliteVersion: string; search: 'fts5' | 'basic';
  importedFrom?: string; importedAt?: string;
}
/** Admission receipts are committed with state before a worker starts. */
export interface CommandReceipt { id: string; kind: string; inputHash: string; result: unknown; createdAt: string; }
