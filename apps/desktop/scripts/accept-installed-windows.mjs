import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { _electron } from '@playwright/test';

if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Use the disposable native Windows CI runner, not a personal workspace.');
const root=process.cwd(), output=path.join(root,'native-acceptance');
await mkdir(output,{recursive:true});
const installer=path.join(output,'JaxOS-Setup-0.5.1-win-x64.exe');
const installed=path.join(process.env.LOCALAPPDATA,'Programs','JaxOS');
const executable=path.join(installed,'JaxOS.exe');
const report={schemaVersion:1,version:'0.5.1',platform:process.platform,arch:process.arch,scope:'Exact public installer; disposable Windows account; no live model, KiCad or GPU acceptance',checks:[],limitations:['No live model on Windows','No KiCad on Windows','No GPU verification','HaaS experiment features not implemented']};
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const run=(command,args)=>new Promise((resolve,reject)=>{const c=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';c.stdout.on('data',x=>text+=x);c.stderr.on('data',x=>text+=x);const t=setTimeout(()=>{c.kill();reject(new Error('Native process timed out.'));},120000);c.once('error',e=>{clearTimeout(t);reject(e);});c.once('exit',code=>{clearTimeout(t);code===0?resolve(text):reject(new Error(`Native process exit ${code}: ${text.slice(-2000)}`));});});
const check=async(name,action)=>{const t=Date.now();try{const details=await action();report.checks.push({name,status:'pass',durationMs:Date.now()-t,...(details?{details}:{})});console.log('PASS',name);}catch(e){report.checks.push({name,status:'fail',error:String(e),durationMs:Date.now()-t});throw e;}};
let app, markerId, db, dataDir;
const marker='JaxOS controlled native acceptance fixture';
async function launch(){
 app=await _electron.launch({executablePath:executable,timeout:45000});
 assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
 assert.equal((await app.evaluate(({app})=>app.getAppPath())).toLowerCase(),path.join(installed,'resources','app.asar').toLowerCase());
 const page=await app.firstWindow();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>Boolean(window.jaxos),{timeout:30000});
 dataDir=await app.evaluate(({app})=>app.getPath('userData'));
 db=path.join(dataDir,'workspace','workspace.sqlite');
 return {page,errors};
}
async function close(){if(app){await app.close();app=undefined;}}
try{
 await check('Published installer checksum',async()=>{const r=JSON.parse(await readFile(path.join(output,'windows-build-receipt-0.5.1.json'),'utf8'));const h=await hash(installer);assert.equal(h,r.sha256);return {sha256:h};});
 await check('Fresh non-elevated installer invocation',()=>run(installer,['/S']));
 await check('Packaged GUI and real coordinator bridge',async()=>{const {page,errors}=await launch();const state=await page.evaluate(()=>window.jaxos.getState());assert.ok(state.conversations.length);await page.evaluate(text=>window.jaxos.addDailyItem(text),marker);const saved=await page.evaluate(()=>window.jaxos.getState());markerId=saved.dailyItems.find(x=>x.text===marker)?.id;assert.ok(markerId);await page.screenshot({path:path.join(output,'native-installed-gui.png')});assert.deepEqual(errors,[]);await close();});
 await check('History survives native application restart',async()=>{const {page,errors}=await launch();const state=await page.evaluate(()=>window.jaxos.getState());assert.ok(state.dailyItems.some(x=>x.id===markerId&&x.text===marker));assert.deepEqual(errors,[]);await close();});
 await check('Installed evaluator works from another directory',async()=>{const p=path.join(installed,'resources','app.asar','dist-electron','eval.cjs');const old=process.env.ELECTRON_RUN_AS_NODE;process.env.ELECTRON_RUN_AS_NODE='1';try{assert.match(await run(executable,[p,'--help']),/Usage: evaluate run/);}finally{if(old===undefined)delete process.env.ELECTRON_RUN_AS_NODE;else process.env.ELECTRON_RUN_AS_NODE=old;}});
 await check('Same-version upgrade preserves saved workspace',async()=>{const before=await hash(db);await run(installer,['/S']);assert.equal(await hash(db),before);const {page}=await launch();assert.ok((await page.evaluate(()=>window.jaxos.getState())).dailyItems.some(x=>x.id===markerId));await close();});
 await check('Uninstall preserves application data',async()=>{const before=await hash(db);await run(path.join(installed,'Uninstall JaxOS.exe'),['/S']);assert.equal(await hash(db),before);let removed=false;try{await readFile(executable);}catch(e){if(e.code==='ENOENT')removed=true;else throw e;}assert.ok(removed,'Installed executable still exists after uninstall.');});
 await check('Reinstall restores the existing workspace',async()=>{await run(installer,['/S']);const {page,errors}=await launch();assert.ok((await page.evaluate(()=>window.jaxos.getState())).dailyItems.some(x=>x.id===markerId));await page.evaluate(id=>window.jaxos.removeDailyItem(id),markerId);assert.deepEqual(errors,[]);await close();});
 report.status='pass';
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1;}
finally{await close().catch(()=>{});await writeFile(path.join(output,'native-acceptance.json'),JSON.stringify(report,null,2)+'\n');}
