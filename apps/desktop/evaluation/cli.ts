import path from 'node:path';
import { runEvaluation } from './runner';

// This entry is bundled beside the private coordinator and model supervisor.
// Electron's Node mode supplies SQLite and ASAR support without a system Node install.
process.env.JAXOS_EVAL_HOST = path.join(__dirname, 'service-host.cjs');
process.env.JAXOS_EVAL_LLAMA_HOST = path.join(__dirname, 'llama-host.cjs');
runEvaluation(process.argv.slice(2), path.resolve(__dirname, '..')).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
