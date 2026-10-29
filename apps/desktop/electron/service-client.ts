import { randomUUID } from 'node:crypto';
import type { AppState } from '../shared/types';
import { SERVICE_METHODS, type RemoteService, type ServiceMessage, type ServiceRequest, type ServiceStatus, type ServiceWire } from '../shared/service-contract';

/** Private parent/worker RPC. Requests interrupted by exit are rejected, never replayed. */
export class ServiceClient {
  readonly remote: RemoteService;
  private wire?: ServiceWire;
  private starting?: Promise<void>;
  private stopping = false;
  private sequence = -1;
  private state?: AppState;
  private status: ServiceStatus = { connected: false, message: 'Starting the workspace service…' };
  private states = new Set<(state: AppState) => void>();
  private statuses = new Set<(status: ServiceStatus) => void>();
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly factory: () => ServiceWire, private readonly requestTimeout = 30_000) {
    this.remote = Object.fromEntries(SERVICE_METHODS.map(method => [method, (...args: unknown[]) => this.call(method, args)])) as RemoteService;
  }
  getStatus() { return { ...this.status }; }
  subscribe(listener: (state: AppState) => void) { this.states.add(listener); return () => { this.states.delete(listener); }; }
  onStatus(listener: (status: ServiceStatus) => void) { this.statuses.add(listener); return () => { this.statuses.delete(listener); }; }
  private setStatus(connected: boolean, message: string) {
    this.status = { connected, message };
    for (const listener of this.statuses) listener(this.getStatus());
  }
  start(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error('The workspace service is closing.'));
    if (this.status.connected) return Promise.resolve();
    if (this.starting) return this.starting;
    this.sequence = -1; this.state = undefined;
    this.setStatus(false, 'Starting the workspace service…');
    this.starting = new Promise<void>((resolve, reject) => {
      let ready = false;
      let wire: ServiceWire;
      const timer = setTimeout(() => { wire?.kill(); reject(new Error('The workspace service did not start. Reconnect to try again.')); }, 15_000);
      try { wire = this.factory(); this.wire = wire; }
      catch (error) { clearTimeout(timer); reject(error); return; }
      wire.onMessage((message: ServiceMessage) => {
        if (wire !== this.wire || message?.protocol !== 1) return;
        if (message.type === 'ready') { ready = true; clearTimeout(timer); this.setStatus(true, 'Workspace service connected'); resolve(); }
        else if (message.type === 'fatal') { clearTimeout(timer); reject(new Error(message.error)); this.setStatus(false, message.error); wire.kill(); }
        else if (message.type === 'state' && Number.isSafeInteger(message.sequence) && message.sequence > this.sequence) {
          this.sequence = message.sequence; this.state = message.state;
          for (const listener of this.states) listener(structuredClone(message.state));
        } else if (message.type === 'result') {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
        }
      });
      wire.onExit(() => {
        if (wire !== this.wire) return;
        clearTimeout(timer); this.wire = undefined;
        const error = new Error('The workspace service stopped. An interrupted request may have been saved; reconnect and review its state before retrying.');
        if (!ready) reject(error);
        for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
        this.pending.clear();
        this.setStatus(false, this.stopping ? 'Workspace service stopped' : error.message);
      });
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  private async call(method: ServiceRequest['method'], args: unknown[]): Promise<any> {
    if (method !== 'shutdown') await this.start();
    if (!this.wire || !this.status.connected) throw new Error('The workspace service is unavailable. Reconnect to continue.');
    const wire = this.wire;
    const result = await new Promise<any>((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The service request timed out. Refresh the workspace before retrying an action.')); }, this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer });
      try { wire.send({ protocol: 1, id, method, args }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
    return result;
  }
  async restart() { await this.stop(); this.stopping = false; await this.start(); return this.remote.getState(); }
  async stop() {
    this.stopping = true;
    await this.starting?.catch(() => {});
    const wire = this.wire;
    if (!wire) return;
    try { if (this.status.connected) await this.call('shutdown', []); }
    finally {
      if (this.wire === wire) this.wire = undefined;
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('The workspace service was stopped. Review saved state before retrying.')); }
      this.pending.clear(); this.setStatus(false, 'Workspace service stopped'); wire.kill();
    }
  }
}
