import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { controlledCoordinator, liveCoordinator } from './coordinator';
import { assembleContext } from '../electron/context';
import { runHarness, stageTools, validateStageCall } from '../electron/harness';
import { detectKiCad, executeKiCad, inspectProject, fingerprintProject } from '../electron/kicad';
import { createEvaluationModel, normalizeModelOptions } from './model';
import { DEFAULT_PROFILE } from '../shared/model-profile';
import type { Message, Run, WorkflowStage } from '../shared/types';

type Status = 'pass'|'fail'|'unscored';
type Case = {id:string; kind:string; stage?:WorkflowStage;tool?:string;arguments?:Record<string,unknown>;allowed?:boolean;project?:string;run?:'drc'|'erc';expected?:string;prompt?:string;expectedPattern?:string};
type CaseResult = {id:string;status:Status;detail:string;durationMs:number;observed?:unknown};
type Report = {schemaVersion:number;runId:string;createdAt:string; suite:string;fixtureSha256:string;sourceSha256:string; environment:Record<string,unknown>;results:CaseResult[]};
const sha=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
export async function runEvaluation(argv: string[], root: string) {
const args = [...argv];
root = path.resolve(root);
async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(path.join(root, dir), { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(rel));
    else if (entry.isFile()) files.push(rel);
    else throw new Error('Evaluation inputs contain an unsupported entry.');
  }
  return files;
}
// Read through Electron's ASAR-aware fs rather than native filesystem copy.
async function copyFixture(source: string, destination: string) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name), dest = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyFixture(src, dest);
    else if (entry.isFile()) await writeFile(dest, await readFile(src), { flag: 'wx' });
    else throw new Error('Fixture contains an unsupported entry.');
  }
}


async function hashFiles(files:string[]) {const hash=createHash('sha256');for(const file of files){const b=await readFile(path.join(root,file));hash.update(file+'\0'+b.length+'\0');hash.update(b);}return hash.digest('hex');}
async function identity() {
  let source = true;
  try { await access(path.join(root, 'evaluation/runner.ts')); } catch { source = false; }
  const files = source
    ? ['package.json', ...await collectFiles('electron'), ...await collectFiles('shared'), ...await collectFiles('evaluation'), ...await collectFiles('scripts')]
    : ['package.json', ...await collectFiles('dist-electron')];
  return {kind: source ? 'source-tree-v2' : 'packaged-bundles-v1', sha256: await hashFiles(files.sort())};
}
function option(name:string, fallback?:string){const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${name}`);return args[i+1];}
function flag(name:string){return args.includes(name);}
function checkArgs(allowedValues:string[],allowedFlags:string[]){const seen=new Set<string>();for(let i=0;i<args.length;i++){if(seen.has(args[i]))throw new Error(`Duplicate argument ${args[i]}`);seen.add(args[i]);if(allowedValues.includes(args[i])){if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${args[i]}`);i++;}else if(!allowedFlags.includes(args[i]))throw new Error(`Unknown argument ${args[i]}`);}}
async function run(){
  checkArgs(['--output','--provider','--model','--url','--executable','--model-path','--gpu-layers','--threads','--context','--output-tokens','--thinking','--kicad','--suite'],['--live-model']);
  const output=option('--output');if(!output)throw new Error('Specify --output for a new results JSON file.');
  const numeric=(name:string)=>option(name)===undefined?undefined:Number(option(name));
  const options=normalizeModelOptions({provider:option('--provider'),model:option('--model'),url:option('--url'),executable:option('--executable'),modelPath:option('--model-path'),gpuLayers:numeric('--gpu-layers'),threads:numeric('--threads'),contextTokens:numeric('--context'),outputTokens:numeric('--output-tokens'),thinking:option('--thinking')});
  const suiteName=option('--suite',options.provider==='llamacpp'?'llama':'development')!;
  if(!['development','heldout','llama'].includes(suiteName))throw new Error('Suite must be development, heldout or llama.');
  if(suiteName==='llama'&&options.provider!=='llamacpp')throw new Error('The llama suite requires --provider llama.cpp.');
  const fixturePath=path.join(root,'evaluation',suiteName==='development'?'fixtures.json':suiteName+'.json');
  const fixtureBytes=await readFile(fixturePath);const suite=JSON.parse(fixtureBytes.toString()) as {schemaVersion:number;suite:string;cases:Case[]};
  if(suite.schemaVersion!==1||typeof suite.suite!=='string'||!Array.isArray(suite.cases)||!suite.cases.length||suite.cases.some(c=>!c||!/^[-a-z0-9]+$/.test(c.id)||!['policy','context','cancel','kicad','kicad-stale','kicad-cancel','coordinator-cancel','coordinator-crash','coordinator-model','model','model-lifecycle'].includes(c.kind)||(c.kind==='kicad'&&!['clean','fault'].includes(c.project!)))||new Set(suite.cases.map(c=>c.id)).size!==suite.cases.length)throw new Error('Invalid fixture suite.');
  const buildIdentity=await identity();const sourceSha256=buildIdentity.sha256;
  const fixtureFiles=await hashFiles([...await collectFiles('tests/fixtures/kicad/clean'),...await collectFiles('tests/fixtures/kicad/fault')].sort());
  // Reserve the requested destination before loading a model or executing tools.
  const outputFile=await open(output,'wx');let written=false;let temp='';
  let adapter:ReturnType<typeof createEvaluationModel>|undefined;
  try {
  temp=await mkdtemp(path.join(os.tmpdir(),'jaxos-evaluation-'));const results:CaseResult[]=[];
  const kicad=await detectKiCad(option('--kicad'));const live=flag('--live-model');
  adapter=createEvaluationModel(path.join(temp,'model'),options,process.env.JAXOS_EVAL_LLAMA_HOST);
  let modelInfo:unknown=null;let modelError='';if(live){try{modelInfo=await adapter.inspect();}catch(e){modelError=e instanceof Error?e.message:String(e);}}
  try{
    for(const c of suite.cases){const start=performance.now();let status:Status='pass', detail='',observed:unknown;
      try{
        if(c.kind==='policy'){
          let allowed=true;try{validateStageCall(c.stage!,{id:c.id,name:c.tool!,arguments:c.arguments!});}catch{allowed=false;}
          observed={allowed};if(allowed!==c.allowed){status='fail';detail=`Expected allowed=${c.allowed}, received ${allowed}.`;}else detail=`Tool request ${allowed?'accepted':'rejected'} as expected.`;
        } else if(c.kind==='context'){
          const history:Message[]=[{id:'1',role:'user',content:'old '.repeat(300),createdAt:'',status:'complete'},{id:'2',role:'assistant',content:'old answer',createdAt:'',status:'complete'},{id:'3',role:'user',content:'Latest requirement: 17',createdAt:'',status:'complete'},{id:'4',role:'assistant',content:'unfinished',createdAt:'',status:'streaming'}];
          const result=assembleContext('Be accurate.',history,{...DEFAULT_PROFILE,contextTokens:1024,outputTokens:256});observed=result;const contents=result.messages.map(m=>m.content);if(!contents.includes('Latest requirement: 17')||contents.includes('unfinished')||result.omitted!==2){status='fail';detail='Latest complete exchange or omission count was incorrect.';}else detail='Retained the latest complete input and excluded unfinished/older messages.';
        } else if(c.kind==='cancel'){
          const controller=new AbortController();controller.abort();let executions=0;try{await runHarness({messages:[],profile:DEFAULT_PROFILE,stage:'test',tools:stageTools('test'),signal:controller.signal,steps:[],persist:async()=>{},execute:async()=>{executions++;return '';},generate:async()=>({usage:{},finishReason:'stop'}),onToken:()=>{},onReasoning:()=>{}});status='fail';detail='Cancelled request completed unexpectedly.';}catch{detail='Pre-cancelled request did not execute a tool.';}observed={executions};if(executions!==0){status='fail';detail='A tool executed despite cancellation.';}
        } else if(c.kind==='kicad'){
          if(!kicad.available){status='unscored';detail=`KiCad unavailable: ${kicad.error??'not found'}`;}else{
            const projectDir=path.join(temp,c.id,'project');await mkdir(path.dirname(projectDir),{recursive:true});await copyFixture(path.join(root,'tests/fixtures/kicad',c.project!),projectDir);
            const project=await inspectProject(projectDir);const before=await fingerprintProject(project);const run:Run={id:randomUUID(),projectId:project.id,kind:c.run!,status:'queued',createdAt:new Date().toISOString(),inputFingerprint:project.fingerprint,stale:false,toolVersion:'',command:[],exitCode:null,summary:'',log:'',findings:[],artifacts:[]};
            const result=await executeKiCad({project,run,executable:kicad.path,dataDir:path.join(temp,c.id,'data'),signal:AbortSignal.timeout(60000)});const unchanged=before===await fingerprintProject(project);
            observed={status:result.status,exitCode:result.exitCode,findings:result.findings.length,toolVersion:result.toolVersion,inputFingerprint:result.inputFingerprint,stale:result.stale,sourceUnchanged:unchanged};
            if(result.status==='error'||result.status==='cancelled'){status='unscored';detail=result.error??result.summary;}else if(result.status!==c.expected||!unchanged||result.stale||(c.expected==='failed'&&result.findings.length===0)){status='fail';detail='Observed KiCad result did not meet fixture criteria.';}else detail=`KiCad reported ${result.status} with ${result.findings.length} findings; source unchanged.`;
          }
        } else if(c.kind==='kicad-stale'||c.kind==='kicad-cancel'){
          if(!kicad.available){status='unscored';detail=`KiCad unavailable: ${kicad.error??'not found'}`;}else{
            const projectDir=path.join(temp,c.id,'project');await mkdir(path.dirname(projectDir),{recursive:true});await copyFixture(path.join(root,'tests/fixtures/kicad/clean'),projectDir);
            const project=await inspectProject(projectDir);const run:Run={id:randomUUID(),projectId:project.id,kind:'erc',status:'queued',createdAt:new Date().toISOString(),inputFingerprint:project.fingerprint,stale:false,toolVersion:'',command:[],exitCode:null,summary:'',log:'',findings:[],artifacts:[]};
            const controller=new AbortController();let changed=false;const result=await executeKiCad({project,run,executable:kicad.path,dataDir:path.join(temp,c.id,'data'),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]),onUpdate(patch){if(c.kind==='kicad-stale'&&patch.toolVersion&&!changed){changed=true;appendFileSync(project.schematic!,'\n');}if(c.kind==='kicad-cancel'&&patch.log?.includes('Checking sheet names'))controller.abort();}});
            observed={status:result.status,stale:result.stale,sourceChanged:changed,cancelled:controller.signal.aborted,toolVersion:result.toolVersion};
            if(result.status==='error'){status='unscored';detail=result.error??result.summary;}
            else if(c.kind==='kicad-stale'){if(!changed||result.status!=='passed'||!result.stale||await fingerprintProject(project)===project.fingerprint){status='fail';detail='Changed source did not produce stale evidence.';}else detail='A changed source invalidated the successful snapshot result.';}
            else if(!controller.signal.aborted||result.status!=='cancelled'){status='fail';detail='Active KiCad job did not terminate as cancelled.';}else detail='Active KiCad job terminated with cancelled status.';
          }
        } else if(c.kind==='coordinator-cancel'||c.kind==='coordinator-crash'){
          const result=await controlledCoordinator(path.join(temp,c.id),c.kind==='coordinator-cancel'?'cancel':'crash');observed=result.observed;if(!result.pass){status='fail';detail='Coordinator recovery or cancellation did not satisfy the fixture.';}else detail='Coordinator state and request count satisfied the fixture.';
        } else if(c.kind==='coordinator-model'){
          if(!live||modelError){status='unscored';detail=live?`Model unavailable: ${modelError}`:'Live inference not requested.';}else{const result=await liveCoordinator(path.join(temp,c.id),options,c.prompt!,c.expectedPattern!);observed=result.observed;if(!result.pass){status='fail';detail='Coordinator response did not meet the fixture criterion.';}else detail='Coordinator response matched the fixture answer.';}
        } else if(c.kind==='model'){
          if(!live||modelError){status='unscored';detail=live?`Model unavailable: ${modelError}`:'Live inference not requested.';}else{
            const result=await adapter.generate(c.prompt!);
            observed=result;if(!new RegExp(c.expectedPattern!).test(result.text.trim())){status='fail';detail='Response did not match the fixture answer.';}else detail='Response matched the fixture answer.';
          }
        } else if(c.kind==='model-lifecycle'){
          if(!live||modelError){status='unscored';detail=live?`Model unavailable: ${modelError}`:'Live inference not requested.';}
          else{const result=await adapter.lifecycle();observed=result.observed;if(!result.pass){status='fail';detail='Managed model lifecycle did not meet the fixture criteria.';}else detail='Managed model loaded with the requested context, cancelled streaming and unloaded.';}
        } else throw new Error(`Unsupported case kind: ${c.kind}`);
      }catch(e){status='unscored';detail=e instanceof Error?e.message:String(e);}
      results.push({id:c.id,status,detail,durationMs:Math.round(performance.now()-start),...(observed===undefined?{}:{observed})});console.log(`${status.toUpperCase()} ${c.id}: ${detail}`);
    }
    const report:Report={schemaVersion:1,runId:randomUUID(),createdAt:new Date().toISOString(),suite:suite.suite,fixtureSha256:sha(fixtureBytes),sourceSha256,environment:{identityKind:buildIdentity.kind,node:process.version,platform:process.platform,arch:process.arch,kicad:kicad.available?{version:kicad.version,path:kicad.path}:null,kicadFixturesSha256:fixtureFiles,model:live?{provider:options.provider,model:options.model,profile:adapter.profile,connection:options.provider==='ollama'?{url:options.url}:{mode:'managed',executable:options.executable,modelPath:options.modelPath,gpuLayers:options.gpuLayers,threads:options.threads},metadata:modelInfo}:null},results};
    await outputFile.writeFile(JSON.stringify(report,null,2)+'\n');written=true;console.log(`Results written to ${output}`);if(results.some(r=>r.status!=='pass'))process.exitCode=1;
  }finally{await adapter.stop();}
  }finally{await adapter?.stop().catch(()=>{});if(temp)await rm(temp,{recursive:true,force:true});await outputFile.close();if(!written)await rm(output,{force:true});}
}
async function compare(){
  checkArgs(['--baseline','--candidate'],[]);const base=option('--baseline'),candidate=option('--candidate');if(!base||!candidate)throw new Error('Specify --baseline and --candidate.');
  const a=JSON.parse(await readFile(base,'utf8')) as Report,b=JSON.parse(await readFile(candidate,'utf8')) as Report;
  function valid(report:Report) {
    return report&&report.schemaVersion===1&&['runId','suite','fixtureSha256','sourceSha256'].every(key=>typeof (report as unknown as Record<string,unknown>)[key]==='string'&&String((report as unknown as Record<string,unknown>)[key]).length>0)&&report.environment&&typeof report.environment==='object'&&!Array.isArray(report.environment)&&Array.isArray(report.results)&&report.results.length>0&&new Set(report.results.map(r=>r?.id)).size===report.results.length&&report.results.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&['pass','fail','unscored'].includes(r.status)&&Number.isFinite(r.durationMs)&&r.durationMs>=0);
  }
  if(!valid(a)||!valid(b))throw new Error('Invalid evaluation report.');
  if(!Array.isArray(a.results)||!a.results.length||!Array.isArray(b.results)||!b.results.length||a.results.some(r=>!['pass','fail','unscored'].includes(r.status))||b.results.some(r=>!['pass','fail','unscored'].includes(r.status))||a.schemaVersion!==1||b.schemaVersion!==1||a.suite!==b.suite||a.fixtureSha256!==b.fixtureSha256||JSON.stringify(a.environment)!==JSON.stringify(b.environment)||JSON.stringify(a.results.map(x=>x.id))!==JSON.stringify(b.results.map(x=>x.id)))throw new Error('Runs are incompatible: fixture, case order or environment differs.');
  console.log(`Baseline ${a.runId} ${a.sourceSha256}\nCandidate ${b.runId} ${b.sourceSha256}`);let changed=false;
  for(let i=0;i<a.results.length;i++){const x=a.results[i],y=b.results[i];console.log(`${x.id}: ${x.status} -> ${y.status} (${x.durationMs}ms -> ${y.durationMs}ms)`);if(x.status!=='pass'||y.status!=='pass')changed=true;}
  if(changed){console.log('A run has failing or unscored cases; no promotion decision is supported.');process.exitCode=1;}else console.log('All candidate cases passed. Review repetitions and held-out cases before promotion.');
}
const usage='Usage: evaluate run --output FILE [--provider ollama|llama.cpp --live-model --executable PATH --model-path GGUF --suite development|llama|heldout --model NAME --url URL --context TOKENS --output-tokens TOKENS --thinking off|on --gpu-layers N --threads N --kicad PATH] | compare --baseline FILE --candidate FILE';
const command=args.shift();try{if(command==='--help'||command==='help'){console.log(usage);}else if(command==='run')await run();else if(command==='compare')await compare();else throw new Error(usage);}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=2;}
}
