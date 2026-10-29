import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Real Electron needs a display on Linux; the application itself is never mocked. */
export default async function setup() {
  if (process.platform !== 'linux' || process.env.DISPLAY) return;
  const portable = '/workspace/.tools/xvfb/root/usr/bin/Xvfb';
  const executable = process.env.JAXOS_XVFB_BIN || (existsSync(portable) ? portable : 'Xvfb');
  const xvfb = spawn(executable, ['-displayfd', '1', '-screen', '0', '1600x1100x24', '-nolisten', 'tcp', '-ac'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostic = '';
  xvfb.stderr.on('data', chunk => { diagnostic += chunk.toString(); });
  try {
    const display = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Xvfb did not start: ${diagnostic}`)), 15_000);
      const stop = (error: Error) => { clearTimeout(timer); reject(error); };
      xvfb.once('error', error => stop(new Error(`Install Xvfb or set JAXOS_XVFB_BIN for Linux E2E: ${error.message}`)));
      xvfb.once('exit', code => stop(new Error(`Xvfb exited (${code}): ${diagnostic}`)));
      xvfb.stdout.on('data', chunk => {
        output += chunk.toString();
        if (/^\d+\n/.test(output)) { clearTimeout(timer); resolve(`:${output.trim()}`); }
      });
    });
    process.env.DISPLAY = display;
    return async () => { xvfb.kill('SIGTERM'); delete process.env.DISPLAY; };
  } catch (error) {
    xvfb.kill('SIGTERM');
    throw error;
  }
}
