import { fork, spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const run=path.join(root,'native/Artifacts','startup-models-'+randomUUID());mkdirSync(run,{recursive:true});
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const endpoint=`http://127.0.0.1:${port}`,player=randomUUID(),headers={Cookie:`campmind-player=${player}`,'X-Camp-Tab':'startup-verification','X-Camp-Native-Protocol':'1'};
const child=fork(path.join(root,'scripts/world/server.ts'),[],{cwd:root,execArgv:['--import','tsx'],windowsHide:true,silent:true,env:{...process.env,CAMP_WORLD_PORT:String(port),CAMP_WORLD_DB:path.join(run,'world.sqlite'),CAMP_SOCIAL_OFFLINE:'1',CAMP_WORLD_OFFLINE_PROGRESS:'0'}});
const log=createWriteStream(path.join(run,'world.log'));child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});const exit=new Promise(r=>child.once('exit',r));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body){const response=await fetch(endpoint+route,{headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
async function mutate(action){const state=await api('/game-api/world');return api('/game-api/world',{revision:state.revision,operation:randomUUID(),action});}
try{
  const deadline=Date.now()+30000;
  while(true){try{await api('/game-api/health');break;}catch(error){if(Date.now()>deadline||child.exitCode!==null)throw error;await delay(200);}}
  await mutate({type:'start',options:{seed:17,mode:'rules'}});await mutate({type:'pause',paused:true});
  await mutate({type:'agency-settings',enabled:true,cognition:false,modelId:'native:qwen3.5-0.8b'});
  let state=await api('/game-api/startup-models',{}),previous='';const samples=[],started=Date.now();
  while(state.stage!=='ready'){
    if(state.stage==='error')throw new Error(state.error);
    if(Date.now()-started>200000)throw new Error('Startup loading timed out');
    const signature=JSON.stringify([state.stage,state.mini?.stage,state.preferred?.stage]);
    if(signature!==previous){samples.push({elapsedMs:Date.now()-started,...state});console.log(signature);previous=signature;}
    await delay(250);state=await api('/game-api/startup-models');
  }
  if(!state.mini.ready||!state.preferred.ready||state.mini.stage!=='ready'||state.preferred.stage!=='ready')throw new Error('Both actual hosts must be ready');
  const result={success:true,elapsedMs:Date.now()-started,state,samples};writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({run,...result}));
  const exeIndex=process.argv.indexOf('--exe');
  if(exeIndex>=0){
    const executable=path.resolve(process.argv[exeIndex+1]);
    if(!executable.startsWith(path.join(root,'native/Builds')+path.sep))throw new Error('Video verification executable must be under native/Builds');
    const releaseAt=Date.now()+25000;
    // A real local proxy delays the readiness response to exercise a load beyond
    // the first video cycle without modifying production code or user saves.
    const proxy=createHttpServer((req,res)=>{void(async()=>{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const forwarded={...req.headers};delete forwarded.host;delete forwarded.connection;delete forwarded['content-length'];
      const response=await fetch(endpoint+req.url,{method:req.method,headers:forwarded,body:req.method==='POST'?Buffer.concat(chunks):undefined});
      const text=await response.text();
      if(req.url==='/game-api/startup-models'&&JSON.parse(text).stage==='ready'&&Date.now()<releaseAt)await delay(releaseAt-Date.now());
      res.writeHead(response.status,{'Content-Type':'application/json'});res.end(text);
    })().catch(error=>{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));});});
    await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
    const player=spawn(executable,['-windowed','-screen-width','1920','-screen-height','1080','-campmind-world-url',`http://127.0.0.1:${proxy.address().port}`,'-campmind-player',headers.Cookie.split('=')[1],'-campmind-startup-capture',run,'-logFile',path.join(run,'player.log')],{cwd:root,windowsHide:false,stdio:'ignore'});
    const playerExit=new Promise(r=>player.once('exit',(code)=>r(code)));
    let videoTimer;
    try{
      const code=await Promise.race([playerExit,new Promise((_,reject)=>{videoTimer=setTimeout(()=>reject(new Error('Video startup timed out')),90000);})]);
      if(code!==0)throw new Error(`Video player exited ${code}`);
      const startup=JSON.parse(readFileSync(path.join(run,'startup-result.json'),'utf8'));
      if(!startup.success||!startup.modelsReady||!startup.worldReady||!startup.firstCycle||startup.loops<1||startup.elapsed<20)throw new Error('Video loading gate did not pass');
      console.log(JSON.stringify({videoVerification:true,run,...startup}));
    }finally{clearTimeout(videoTimer);if(player.exitCode===null){player.kill();await playerExit;}await new Promise(r=>proxy.close(r));}
  }
}finally{
  if(child.connected)child.send({type:'campmind-stop'});
  await Promise.race([exit,delay(10000)]);if(child.exitCode===null){child.kill();await exit;}log.end();
}
