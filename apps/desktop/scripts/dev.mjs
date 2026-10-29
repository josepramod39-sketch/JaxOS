import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';
await import('./build-electron.mjs');
const server = await createServer();
await server.listen();
const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
});
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  if (!child.killed) child.kill();
  await server.close();
  process.exit(code);
}
child.on('exit', code => close(code ?? 1));
child.on('error', error => { console.error(error.message); close(1); });
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
