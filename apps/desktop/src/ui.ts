import type { Run, RunKind } from '../shared/types';

export type Perform = (operation: () => Promise<unknown>, success?: string) => Promise<boolean>;
export const runLabels: Record<RunKind, string> = {
  erc: 'Electrical rules', drc: 'PCB design rules', preview: 'Project previews', fabrication: 'Fabrication files',
};
export const statusLabel = (run: Run): string => ({
  queued: 'Queued', running: 'Running', passed: run.kind === 'erc' || run.kind === 'drc' ? 'Checks passed' : 'Completed',
  failed: 'Checks failed', error: 'Could not complete', cancelled: 'Cancelled',
}[run.status]);
export function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
export function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export const isRunning = (run: Run) => run.status === 'queued' || run.status === 'running';
