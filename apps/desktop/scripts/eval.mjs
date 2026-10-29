import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(path.join(os.tmpdir(),'jaxos-eval-code-'));
try {
  const output=path.join(dir,'runner.cjs');
  const host=path.join(dir,'service-host.cjs');
  await build({absWorkingDir:root,entryPoints:{'service-host':'electron/service-host.ts','llama-host':'electron/llama-host.ts',runner:'evaluation/runner.ts'},outdir:dir,outExtension:{'.js':'.cjs'},bundle:true,platform:'node',format:'cjs',target:'node24'});
  process.env.JAXOS_EVAL_HOST=host;
  process.env.JAXOS_EVAL_LLAMA_HOST=path.join(dir,'llama-host.cjs');
  await createRequire(import.meta.url)(output).runEvaluation(process.argv.slice(2),root);
} finally { await rm(dir,{recursive:true,force:true}); }
