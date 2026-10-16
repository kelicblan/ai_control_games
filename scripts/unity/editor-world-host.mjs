import {fork} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,createWriteStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
async function acquireLease(dataDirectory,waitMs){
  const db=new DatabaseSync(path.join(dataDirectory,'world-host-lease.sqlite')),owner=randomUUID();let closed=false;
  const close=()=>{if(!closed){closed=true;db.close();}};
  try{
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS writer(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,pid INTEGER NOT NULL,server_pid INTEGER)');
    const deadline=Date.now()+waitMs;
    while(true){
      db.exec('BEGIN IMMEDIATE');const lease=db.prepare('SELECT * FROM writer WHERE id=1').get();
      if(!lease||!alive(lease.pid)&&!alive(lease.server_pid)){
        db.prepare('INSERT OR REPLACE INTO writer VALUES(1,?,?,NULL)').run(owner,process.pid);db.exec('COMMIT');
        return {server(pid){if(pid)db.prepare('UPDATE writer SET server_pid=? WHERE owner=?').run(pid,owner);},release(){if(closed)return;try{db.prepare('DELETE FROM writer WHERE owner=?').run(owner);}finally{close();}}};
      }
      db.exec('ROLLBACK');if(Date.now()>=deadline)throw new Error('An Editor world authority is already running for this save');await delay(50);
    }
  }catch(error){try{db.exec('ROLLBACK');}catch{}close();throw error;}
}
export async function launchEditorWorld({root,dataDirectory,runDirectory,offline=false,leaseWaitMs=5000}){
  root=path.resolve(root);dataDirectory=path.resolve(dataDirectory);runDirectory=path.resolve(runDirectory);
  mkdirSync(dataDirectory,{recursive:true});mkdirSync(runDirectory,{recursive:true});
  const lease=await acquireLease(dataDirectory,Math.max(0,Math.min(10000,leaseWaitMs)));
  try{
  const identityFile=path.join(dataDirectory,'identity.json');
  const identity=existsSync(identityFile)?JSON.parse(readFileSync(identityFile,'utf8')):{player:randomUUID()};
  if(!/^[a-f0-9-]{36}$/.test(identity.player))throw new Error('Invalid Editor world identity');
  if(!existsSync(identityFile))writeFileSync(identityFile,JSON.stringify(identity));
  const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const endpoint=`http://127.0.0.1:${port}`,database=path.join(dataDirectory,'world.sqlite');
  const log=createWriteStream(path.join(runDirectory,'world.log'));
  const server=fork(path.join(root,'scripts/world/server.ts'),[],{cwd:root,execArgv:['--import','tsx'],windowsHide:true,silent:true,env:{...process.env,CAMP_WORLD_DB:database,CAMP_WORLD_PORT:String(port),CAMP_SOCIAL_OFFLINE:offline?'1':'0'}});
  lease.server(server.pid);
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  const exited=new Promise(resolve=>{server.once('exit',resolve);server.once('error',resolve);});let stopped;
  const stop=()=>stopped??=(async()=>{let timeout;try{if(server.exitCode===null&&server.signalCode===null){if(server.connected)server.send({type:'campmind-stop'});await Promise.race([exited,new Promise(resolve=>{timeout=setTimeout(resolve,8000);})]);if(server.exitCode===null&&server.signalCode===null){server.kill();await exited;}}}finally{clearTimeout(timeout);log.end();lease.release();}})();
  try{
    const deadline=Date.now()+30000;let ready=false;
    while(Date.now()<deadline){
      if(server.exitCode!==null||server.signalCode!==null)throw new Error('Editor world exited during startup');
      try{const response=await fetch(endpoint+'/game-api/health',{signal:AbortSignal.timeout(1000)});const health=await response.json();if(response.ok&&health.service==='campmind-world-v1'&&path.resolve(health.root).toLowerCase()===root.toLowerCase()){ready=true;break;}}catch{}
      await delay(100);
    }
    if(!ready)throw new Error('Editor world readiness timed out');
    return {endpoint,player:identity.player,database,pid:server.pid,stop};
  }catch(error){await stop();throw error;}
  }catch(error){lease.release();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const runDirectory=path.resolve(option('--run')),owner=Number(option('--owner'));
  const allowed=path.join(root,'native','Artifacts')+path.sep;
  if(!runDirectory.startsWith(allowed)||!Number.isSafeInteger(owner)||owner<=0)throw new Error('Invalid Editor host ownership');
  const dataDirectory=path.resolve(option('--data')??path.join(root,'native','LocalData','editor-world'));
  if(!dataDirectory.toLowerCase().startsWith((path.join(root,'native','LocalData')+path.sep).toLowerCase()))throw new Error('Editor test data must remain inside native/LocalData');
  let host,timer,closing=false;
  const close=async()=>{if(closing)return;closing=true;clearInterval(timer);if(host)await host.stop();process.exit(0);};
  try{
    host=await launchEditorWorld({root,dataDirectory,runDirectory});
    writeFileSync(path.join(runDirectory,'ready.json'),JSON.stringify({version:1,kind:'typescript-editor-world',endpoint:host.endpoint,player:host.player,owner,pid:host.pid,database:host.database}));
    timer=setInterval(()=>{let alive=true;try{process.kill(owner,0);}catch(error){alive=error.code==='EPERM';}if(!alive||existsSync(path.join(runDirectory,'stop')))void close();},250);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());
  }catch(error){mkdirSync(runDirectory,{recursive:true});writeFileSync(path.join(runDirectory,'error.json'),JSON.stringify({error:error.message}));if(host)await host.stop();process.exitCode=1;}
}
