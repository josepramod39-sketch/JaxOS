import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

// Private supervisor: an IPC disconnect after coordinator death releases its model process.
const config=JSON.parse(process.argv[2]??'null') as {executable:string;args:string[];directory:string};
if(!process.send||!config?.executable||!Array.isArray(config.args))throw new Error('Start the llama.cpp host through private IPC.');
const server=spawn(config.executable,config.args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
function send(message:unknown){if(process.connected)try{process.send?.(message as any,undefined,undefined,()=>{});}catch{}}
let closing=false;
async function finish(code:number){await rm(config.directory,{recursive:true,force:true}).catch(()=>{});process.exit(code);}
function stop(){if(closing)return;closing=true;server.kill();const timer=setTimeout(()=>{server.kill('SIGKILL');},1500);timer.unref();}
server.stdout?.on('data',chunk=>send({type:'log',text:chunk.toString().slice(-8000)}));
server.stderr?.on('data',chunk=>send({type:'log',text:chunk.toString().slice(-8000)}));
server.once('spawn',()=>send({type:'started',pid:server.pid}));
server.once('error',error=>{send({type:'error',message:error.message});void finish(1);});
server.once('exit',(code,signal)=>{send({type:'exit',code,signal});void finish(code??1);});
process.on('message',message=>{if((message as {type?:string})?.type==='stop')stop();});
process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
if(!process.connected)stop();
