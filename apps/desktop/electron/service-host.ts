import { open, readFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AppService } from './service';
import { SERVICE_METHODS, type ServiceMessage, type ServiceRequest } from '../shared/service-contract';

type ParentPort = { postMessage(message: ServiceMessage): void; on(event: string, listener: (event: any) => void): void; };
const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;
const send = (message: ServiceMessage) => { if (parentPort) parentPort.postMessage(message); else process.send?.(message); };
const dataDir = process.argv[2];
let service: AppService | undefined;
let ownedLock = false;
let closing = false;
const lockFile = dataDir ? path.join(dataDir, 'coordinator.lock') : '';

async function acquireLock() {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(lockFile, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ pid: process.pid })); await file.sync(); ownedLock = true; }
      finally { await file.close(); }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const prior = JSON.parse(await readFile(lockFile, 'utf8'));
      if (!Number.isSafeInteger(prior.pid) || prior.pid <= 0) throw new Error('Workspace lock is unreadable. Close other JaxOS services before repairing it.');
      try { process.kill(prior.pid, 0); throw new Error('Another workspace service is already using this data folder.'); }
      catch (probe) { if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe; }
      await unlink(lockFile);
    }
  }
  throw new Error('Could not acquire the workspace service lock.');
}
async function stop() {
  if (closing) return;
  closing = true;
  try { await service?.shutdown(); }
  finally { if (ownedLock) { await unlink(lockFile).catch(() => {}); ownedLock = false; } }
}
async function dispatch(raw: unknown) {
  let id = '';
  try {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid service request.');
    const request = raw as ServiceRequest;
    if (typeof request.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.id)) throw new Error('Invalid request ID.');
    id = request.id;
    if (request.protocol !== 1 || !Array.isArray(request.args) || request.args.length > 4 || Buffer.byteLength(JSON.stringify(request.args)) > 1_000_000) throw new Error('Invalid service request envelope.');
    if (request.method === 'shutdown') { await stop(); send({ protocol: 1, type: 'result', id }); setTimeout(() => process.exit(0), 25); return; }
    if (!(SERVICE_METHODS as readonly string[]).includes(request.method)) throw new Error('Unknown service method.');
    if (!service || closing) throw new Error('The workspace service is unavailable.');
    const method = service[request.method] as (...args: unknown[]) => unknown;
    const result = await method.apply(service, request.args);
    send({ protocol: 1, type: 'result', id, result: request.method === 'getState' ? service.getState() : result });
  } catch (error) { send({ protocol: 1, type: 'result', id, error: (error instanceof Error ? error.message : 'Service operation failed.').slice(0, 2000) }); }
}

async function main() {
  if (!dataDir || !path.isAbsolute(dataDir) || (!parentPort && !process.send)) throw new Error('Start this coordinator through its private parent transport with an absolute workspace path.');
  await acquireLock();
  service = new AppService(dataDir);
  await service.init();
  let sequence = 0;
  service.subscribe(state => send({ protocol: 1, type: 'state', sequence: ++sequence, state }));
  send({ protocol: 1, type: 'state', sequence: ++sequence, state: service.getState() });
  if (parentPort) parentPort.on('message', event => { void dispatch(event.data); });
  else process.on('message', message => { void dispatch(message); });
  send({ protocol: 1, type: 'ready' });
  parentPort?.on('close', () => { void stop().finally(() => process.exit(0)); });
  const owner = Number(process.env.JAXOS_SERVICE_PARENT_PID);
  if (Number.isSafeInteger(owner) && owner > 0) setInterval(() => {
    try { process.kill(owner, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') void stop().finally(() => process.exit(0)); }
  }, 5000).unref();
}
process.on('SIGTERM', () => { void stop().finally(() => process.exit(0)); });
process.on('SIGINT', () => { void stop().finally(() => process.exit(0)); });
process.on('disconnect', () => { void stop().finally(() => process.exit(0)); });
main().catch(async error => { send({ protocol: 1, type: 'fatal', error: error instanceof Error ? error.message : 'The service could not start.' }); await stop().catch(() => {}); setTimeout(() => process.exit(1), 25); });
