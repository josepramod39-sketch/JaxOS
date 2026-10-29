import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { createEvaluationModel, normalizeModelOptions } from '../evaluation/model';

describe('llama.cpp evaluation provider', () => {
  it('rejects ambiguous, remote and incompatible inputs before running a provider', () => {
    expect(() => normalizeModelOptions({provider:'remote'})).toThrow(/Provider/);
    expect(() => normalizeModelOptions({provider:'ollama',url:'https://example.com'})).toThrow(/localhost|loopback/);
    expect(() => normalizeModelOptions({provider:'ollama',modelPath:'/tmp/model.gguf'})).toThrow(/only/);
    expect(() => normalizeModelOptions({provider:'llama.cpp',executable:'relative',modelPath:'/tmp/model.gguf'})).toThrow(/absolute/);
    expect(() => normalizeModelOptions({provider:'llama.cpp',executable:'/tmp/server',modelPath:'/tmp/model.gguf',url:'http://127.0.0.1:8080'})).toThrow(/private loopback/);
    expect(() => normalizeModelOptions({provider:'llama.cpp',executable:'/tmp/server',modelPath:'/tmp/model.gguf',gpuLayers:1000})).toThrow(/layers/);
    expect(() => normalizeModelOptions({contextTokens:1024,outputTokens:1024})).toThrow(/256/);
    expect(normalizeModelOptions({provider:'llama.cpp',executable:'/tmp/server',modelPath:'/tmp/model.gguf'})).toMatchObject({provider:'llamacpp',model:'jaxos-gguf',gpuLayers:0,profile:{contextTokens:4096,outputTokens:256,thinking:'off'}});
  });

  it.skipIf(process.platform === 'win32')('uses the owned supervisor for metadata, cancellation, recovery and cleanup with a controlled executable', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jaxos-eval-provider-'));
    const executable = path.join(dir, 'controlled-llama.cjs'); const modelPath = path.join(dir, 'controlled.gguf'); const host = path.join(dir, 'llama-host.cjs');
    // This is a controlled protocol fixture, not evidence of real GGUF inference.
    const script = `#!${process.execPath}
const http=require('node:http');const fs=require('node:fs');const args=process.argv.slice(2);
if(args.includes('--version')){console.log('llama.cpp controlled test version 1');process.exit(0);}
const value=name=>args[args.indexOf(name)+1];const key=fs.readFileSync(value('--api-key-file'),'utf8').trim();const model=value('--model');
fs.writeFileSync(model+'.runtime.json',JSON.stringify({pid:process.pid,args}));
const event=data=>'data: '+(typeof data==='string'?data:JSON.stringify(data))+'\\n\\n';
const server=http.createServer((req,res)=>{
 if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);res.end();return;}
 if(req.url==='/health'){res.end(JSON.stringify({status:'ok'}));return;}
 if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'jaxos-gguf',owned_by:'llamacpp',meta:{n_ctx:Number(value('--ctx-size')),n_ctx_train:8192,size:2048,n_params:1000}}]}));return;}
 if(req.url.startsWith('/props')){res.end(JSON.stringify({model_path:model,default_generation_settings:{n_ctx:Number(value('--ctx-size'))},chat_template:'enable_thinking'}));return;}
 let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
  const input=JSON.parse(body);fs.appendFileSync(model+'.requests.jsonl',JSON.stringify(input)+'\\n');
  if(input.messages[0].content==='Controlled server failure'){res.writeHead(500);res.end('controlled');return;}
  res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(event({choices:[{index:0,delta:{content:'ready'},finish_reason:null}]}));
  const timer=setTimeout(()=>res.end(event({choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:4,completion_tokens:1}})+event('[DONE]')),100);
  res.on('close',()=>clearTimeout(timer));
 });
});server.listen(Number(value('--port')),'127.0.0.1');
`;
    const weights = Buffer.alloc(2048); weights.write('GGUF');
    await writeFile(executable, script); await chmod(executable, 0o700); await writeFile(modelPath, weights);
    await build({entryPoints:['electron/llama-host.ts'],bundle:true,platform:'node',format:'cjs',outfile:host,logLevel:'silent'});
    const adapter = createEvaluationModel(path.join(dir,'data'), normalizeModelOptions({provider:'llama.cpp',executable,modelPath}), host);
    const assertStopped = async () => { const {pid}=JSON.parse(await readFile(modelPath+'.runtime.json','utf8')); expect(() => process.kill(pid,0)).toThrow(); };
    try {
      const metadata = await adapter.inspect();
      expect(metadata).toMatchObject({details:{local:true,effectiveContext:4096},files:{model:{sha256:createHash('sha256').update(weights).digest('hex'),bytes:2048}},runtime:{contextTokens:4096,requestedGpuLayers:0,threads:4}});
      expect(JSON.stringify(metadata)).not.toMatch(/api-key|Bearer/); await assertStopped();
      expect(await adapter.generate('Say ready.')).toMatchObject({text:'ready',finishReason:'stop',usage:{inputTokens:4,outputTokens:1}}); await assertStopped();
      await expect(adapter.generate('Controlled server failure')).rejects.toThrow(/HTTP 500/); await assertStopped();
      expect(await adapter.lifecycle()).toMatchObject({pass:true,observed:{effectiveContext:4096,cancellation:{aborted:true,rejected:true},recovery:{text:'ready'},unloaded:{running:false,owned:false,remainingModels:0}}}); await assertStopped();
      const requests=(await readFile(modelPath+'.requests.jsonl','utf8')).trim().split('\n').map(line=>JSON.parse(line));
      expect(requests).toHaveLength(4);expect(requests[0]).toMatchObject({model:'jaxos-gguf',max_tokens:256,temperature:0,chat_template_kwargs:{enable_thinking:false}});
    } finally { await adapter.stop(); await rm(dir,{recursive:true,force:true}); }
  }, 30000);
});
