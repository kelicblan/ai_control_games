import { fork, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const executable=path.resolve(option('--exe')??'');
if(!executable.startsWith(path.join(root,'native','Builds')+path.sep)||!existsSync(executable))throw new Error('--exe must point to an existing native/Builds executable');
const aiProbe=args.includes('--ai-probe');const probe=args.includes('--probe')||aiProbe;
const run=path.join(root,'native','Artifacts','slice-'+randomUUID());mkdirSync(run,{recursive:true});
const data=path.join(root,'native','LocalData','ts-native-slice');mkdirSync(data,{recursive:true});
const identityFile=path.join(data,'identity.json');
const identity=existsSync(identityFile)?JSON.parse(readFileSync(identityFile,'utf8')):{player:randomUUID()};
if(!/^[a-f0-9-]{36}$/.test(identity.player))throw new Error('Invalid isolated identity');
if(!existsSync(identityFile))writeFileSync(identityFile,JSON.stringify(identity));
const serverSocket=createServer();await new Promise((resolve,reject)=>{serverSocket.once('error',reject);serverSocket.listen(0,'127.0.0.1',resolve);});const port=serverSocket.address().port;await new Promise(resolve=>serverSocket.close(resolve));
const database=path.join(data,'world.sqlite');const endpoint=`http://127.0.0.1:${port}`;
const serverLog=createWriteStream(path.join(run,'world.log'));
const server=fork(path.join(root,'scripts/world/server.ts'),[],{cwd:root,execArgv:['--import','tsx'],windowsHide:true,silent:true,env:{...process.env,CAMP_WORLD_DB:database,CAMP_WORLD_PORT:String(port),CAMP_SOCIAL_OFFLINE:aiProbe?'0':probe?'1':process.env.CAMP_SOCIAL_OFFLINE??'0'}});
server.stdout.pipe(serverLog,{end:false});server.stderr.pipe(serverLog,{end:false});
const serverExit=new Promise(resolve=>server.once('exit',(code,signal)=>resolve({code,signal})));
let player,playerExit;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const finished=child=>child.exitCode!==null||child.signalCode!==null;
async function stopOwned(){
  if(player&&!finished(player)){player.kill();await playerExit;}
  if(!finished(server)){if(server.connected)server.send({type:'campmind-stop'});await Promise.race([serverExit,delay(8000)]);if(!finished(server)){server.kill();await serverExit;}}
  serverLog.end();
}
process.once('SIGINT',()=>void stopOwned());process.once('SIGTERM',()=>void stopOwned());
try{
  const deadline=Date.now()+30000;let ready=false;
  while(Date.now()<deadline){if(finished(server))throw new Error('Isolated world process exited during startup');try{const r=await fetch(endpoint+'/game-api/health',{signal:AbortSignal.timeout(1000)});const health=await r.json();if(r.ok&&health.service==='campmind-world-v1'&&path.resolve(health.root).toLowerCase()===root.toLowerCase()){ready=true;break;}}catch{}await delay(200);}
  if(!ready)throw new Error('Isolated world did not become ready');
  const playerArgs=['-windowed','-screen-width','1280','-screen-height','720','-campmind-world-url',endpoint,'-campmind-player',identity.player,'-logFile',path.join(run,'player.log')];
  if(probe)playerArgs.push(aiProbe?'-campmind-ai-probe':'-campmind-bridge-probe',run);
  // This is the interactive game window. Hiding it prevents frame updates in
  // existing builds and invalidates rendered acceptance evidence.
  player=spawn(executable,playerArgs,{cwd:path.dirname(executable),windowsHide:false,stdio:'ignore'});
  playerExit=new Promise((resolve,reject)=>{player.once('error',reject);player.once('exit',(code,signal)=>resolve({code,signal}));});
  writeFileSync(path.join(run,'processes.json'),JSON.stringify({world:server.pid,player:player.pid,database,endpoint,executable}));
  console.log(JSON.stringify({run,database,endpoint,kind:'TS-authoritative-native-slice',socialMode:aiProbe?'actual-local-model':probe?'offline-test':'configured'}));
  let result;
  if(probe){const timeout=Number(option('--timeout')??120)*1000;let timer;try{result=await Promise.race([playerExit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native bridge probe timed out')),timeout);})]);}finally{clearTimeout(timer);}}
  else result=await playerExit;
  if(result.code!==0)throw new Error(`Player exited ${result.code??result.signal}`);
  if(probe){const report=JSON.parse(readFileSync(path.join(run,aiProbe?'ai-result.json':'bridge-result.json'),'utf8'));if(!report.success||report.authority!=='typescript'||!report.scope||(!aiProbe&&report.motionDistance<1))throw new Error('Native bridge acceptance failed');
    if(aiProbe){await stopOwned();const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database,{readOnly:true});try{
      const row=db.prepare('SELECT revision,payload,checksum FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(identity.player);
      if(!row||createHash('sha256').update(row.payload).digest('hex')!==row.checksum)throw new Error('Saved world checksum failed');
      const saved=JSON.parse(row.payload);const message=saved.state.socialLife?.messages.find(m=>m.id===report.dialogueId);
      if(!message||message.source!==report.source||message.text!==report.text||`${saved.journal.generation}:${saved.journal.branch}`!==report.scope)throw new Error('Displayed AI reply was not confirmed in saved world');
      writeFileSync(path.join(run,'ai-persistence.json'),JSON.stringify({success:true,revision:row.revision,scope:report.scope,dialogueId:message.id,source:message.source,checksumVerified:true}));
    }finally{db.close();}}
    console.log(JSON.stringify(report));}
  writeFileSync(path.join(run,'launcher-result.json'),JSON.stringify({success:true,kind:'TS-authoritative-native-slice'}));
}catch(error){writeFileSync(path.join(run,'launcher-result.json'),JSON.stringify({success:false,error:error.message}));console.error(error.message);process.exitCode=1;}
finally{await stopOwned();}
