import { fork, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { machineVillageBuildRoot } from './village-package.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const executable=path.resolve(option('--exe')??'');
const localBuildRoot=path.join(process.env.LOCALAPPDATA??path.join(homedir(),'AppData','Local'),'CampMindBuilds');
const inBuildRoot = directory => executable.toLowerCase().startsWith((path.resolve(directory)+path.sep).toLowerCase());
if((!inBuildRoot(path.join(root,'native','Builds'))&&!(args.includes('--external-build')&&(inBuildRoot(localBuildRoot)||inBuildRoot(machineVillageBuildRoot()))))||!existsSync(executable))throw new Error('--exe must point to an existing native/Builds executable or an explicit --external-build under an allowed CampMind build root');
const layout=option('--layout')??(existsSync(path.join(path.dirname(executable),'world-layout.json'))?JSON.parse(readFileSync(path.join(path.dirname(executable),'world-layout.json'),'utf8')).layout:'legacy');
if(!['legacy','new-world-v1'].includes(layout))throw new Error('Unknown world layout');
const newWorldProbe=args.includes('--new-world-probe');
const villageProbe=args.includes('--village-probe'),animalProbe=args.includes('--animal-probe');
const aiProbe=args.includes('--ai-probe'),uiProbe=args.includes('--ui-probe'),valleyProbe=args.includes('--valley-probe');const probe=args.includes('--probe')||aiProbe||uiProbe||valleyProbe||newWorldProbe||villageProbe||animalProbe;
const run=path.join(root,'native','Artifacts','slice-'+randomUUID());mkdirSync(run,{recursive:true});
// Fresh diagnostics get a separate identity/database; never reset the persistent sample.
const data=path.resolve(option('--data-dir')??path.join(root,'native','LocalData',args.includes('--fresh')?'ts-native-slice-'+path.basename(run):layout==='new-world-v1'?'new-world-v1':'ts-native-slice'));
if(!data.startsWith(path.join(root,'native','LocalData')+path.sep))throw new Error('--data-dir must stay inside native/LocalData');
mkdirSync(data,{recursive:true});
const identityFile=path.join(data,'identity.json');
const identity=existsSync(identityFile)?JSON.parse(readFileSync(identityFile,'utf8')):{player:randomUUID()};
if(!/^[a-f0-9-]{36}$/.test(identity.player))throw new Error('Invalid isolated identity');
if(!existsSync(identityFile))writeFileSync(identityFile,JSON.stringify(identity));
const serverSocket=createServer();await new Promise((resolve,reject)=>{serverSocket.once('error',reject);serverSocket.listen(0,'127.0.0.1',resolve);});const port=serverSocket.address().port;await new Promise(resolve=>serverSocket.close(resolve));
const database=path.join(data,'world.sqlite');const endpoint=`http://127.0.0.1:${port}`;
const serverLog=createWriteStream(path.join(run,'world.log'));
const server=fork(path.join(root,'scripts/world/server.ts'),[],{cwd:root,execArgv:['--import','tsx'],windowsHide:true,silent:true,env:{...process.env,CAMP_VILLAGE_DEFAULT:args.includes('--village-default')?'1':process.env.CAMP_VILLAGE_DEFAULT??'0',CAMP_WORLD_TRACE_REQUESTS:args.includes('--trace-world')?'1':'0',CAMP_WORLD_LAYOUT:layout,CAMP_WORLD_DB:database,CAMP_WORLD_PORT:String(port),CAMP_WORLD_OFFLINE_PROGRESS:'0',CAMP_VILLAGE_EXPERIMENTAL:process.env.CAMP_VILLAGE_EXPERIMENTAL??'1',CAMP_VILLAGE_OFFLINE_PROGRESS:process.env.CAMP_VILLAGE_OFFLINE_PROGRESS??'0',CAMP_SOCIAL_OFFLINE:aiProbe||args.includes('--online-social')?'0':probe?'1':process.env.CAMP_SOCIAL_OFFLINE??'0'}});
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
  const fixedProbe=probe&&!args.includes('--native-display');
  const probeWidth=option('--width')??(uiProbe||valleyProbe||newWorldProbe?'1920':'1280'),probeHeight=option('--height')??(uiProbe||valleyProbe||newWorldProbe?'1080':'720');
  if(!/^\d+$/.test(probeWidth)||!/^\d+$/.test(probeHeight)||Number(probeWidth)<640||Number(probeWidth)>3840||Number(probeHeight)<360||Number(probeHeight)>2160)throw new Error('Invalid diagnostic viewport');
  const displayArgs=fixedProbe?['-windowed','-screen-width',probeWidth,'-screen-height',probeHeight]:[];
  if(args.includes('--startup-capture'))displayArgs.push('-windowed','-screen-width','1920','-screen-height','1080','-campmind-startup-capture',run);
  const playerArgs=[...displayArgs,'-campmind-world-url',endpoint,'-campmind-player',identity.player,'-logFile',path.join(run,'player.log')];
  if(option('--soak-seconds'))playerArgs.push('-campmind-world-soak',option('--soak-seconds'));
  if(args.includes('--stair-probe'))playerArgs.push('-campmind-stair-probe');
  if(args.includes('--actor-motion-probe'))playerArgs.push('-campmind-actor-motion-probe');
  if(args.includes('--gate-probe'))playerArgs.push('-campmind-gate-probe');
  if(probe&&!villageProbe&&!animalProbe)playerArgs.push(newWorldProbe?'-campmind-new-world-probe':uiProbe?'-campmind-ui-probe':aiProbe?'-campmind-ai-probe':valleyProbe?'-campmind-valley-probe':'-campmind-bridge-probe',run);
  if(villageProbe&&!args.includes('--with-startup'))playerArgs.push('-campmind-village-probe',run);
  // This is the interactive game window. Hiding it prevents frame updates in
  // existing builds and invalidates rendered acceptance evidence.
  player=spawn(executable,playerArgs,{cwd:path.dirname(executable),windowsHide:false,stdio:'ignore',env:{...process.env,...(args.includes('--village-default')?{CAMP_VILLAGE_DEFAULT:'1'}:{}),...(villageProbe?{CAMP_VILLAGE_PROBE_OUTPUT:run}:{}),...(animalProbe?{CAMP_ANIMAL_PROBE_OUTPUT:run}:{})}});
  playerExit=new Promise((resolve,reject)=>{player.once('error',reject);player.once('exit',(code,signal)=>resolve({code,signal}));});
  writeFileSync(path.join(run,'processes.json'),JSON.stringify({world:server.pid,player:player.pid,database,endpoint,executable}));
  console.log(JSON.stringify({run,database,endpoint,kind:'TS-authoritative-native-slice',socialMode:aiProbe||args.includes('--online-social')?'configured-live-model':probe?'offline-test':'configured'}));
  let result;
  if(probe){const timeout=Number(option('--timeout')??120)*1000;let timer;try{result=await Promise.race([playerExit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native bridge probe timed out')),timeout);})]);}finally{clearTimeout(timer);}}
  else result=await playerExit;
  if(result.code!==0)throw new Error(`Player exited ${result.code??result.signal}`);
  if(villageProbe&&process.env.CAMP_UI_LAYOUT_PROBE==='1'){
    const report=JSON.parse(readFileSync(path.join(run,'village-result.json'),'utf8'));
    if(!report.success||report.classification!=='ui-layout-only'||!report.worldId||report.modelsVerified!==false)throw new Error('UI layout-only probe failed');
    await stopOwned();writeFileSync(path.join(run,'ui-layout-result.json'),JSON.stringify(report));console.log(JSON.stringify(report));
  }else if(villageProbe&&process.env.CAMP_COGNITION_SETTINGS_PROBE==='1'){
    const report=JSON.parse(readFileSync(path.join(run,'village-result.json'),'utf8'));
    if(!report.success||report.classification!=='cognition-settings-only'||!report.selectionAndReopenVerified||report.defaultModel!=='minimind3'||report.preferredModel!=='native:qwen3.5-2b')throw new Error('Cognition settings UI probe failed');
    await stopOwned();const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database,{readOnly:true});
    try{const row=db.prepare('SELECT payload FROM cognition_settings WHERE player=?').get(identity.player);const settings=row&&JSON.parse(row.payload);if(settings?.modelId!=='minimind3'||settings.cognition!==true)throw new Error('Cognition settings were not persisted');report.persistenceVerified=true;}finally{db.close();}
    writeFileSync(path.join(run,'cognition-settings-result.json'),JSON.stringify(report));console.log(JSON.stringify(report));
  }else if(probe){const report=JSON.parse(readFileSync(path.join(run,animalProbe?'animal-result.json':villageProbe?'village-result.json':newWorldProbe?'new-world-result.json':uiProbe?'ui-result.json':aiProbe?'ai-result.json':valleyProbe?'valley-result.json':'bridge-result.json'),'utf8'));if(!report.success||report.authority!=='typescript'||!(report.scope||(animalProbe&&report.worldId))||(!animalProbe&&!villageProbe&&!aiProbe&&!uiProbe&&!valleyProbe&&report.motionDistance<1))throw new Error('Native bridge acceptance failed');
    if(animalProbe){await stopOwned();const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database,{readOnly:true});try{const worldRow=db.prepare('SELECT payload FROM village_worlds_v1 WHERE world_id=?').get(report.worldId);const migrated=worldRow?JSON.parse(worldRow.payload).wildlife:null;const row=migrated?{payload:JSON.stringify(migrated),checksum:null}:db.prepare('SELECT payload,checksum FROM village_animals_v1 WHERE world_id=?').get(report.worldId);if(!row)throw new Error('Animal save absent');const {tsImport}=await import('tsx/esm/api');const {digest}=await tsImport('../../packages/action-runtime/src/json.ts',import.meta.url);const saved=JSON.parse(row.payload);if(row.checksum!==null&&digest(saved)!==row.checksum||saved.ecology.animals.length!==22||new Set(saved.ecology.animals.map(a=>a.species)).size!==6)throw new Error('Animal persistence mismatch');writeFileSync(path.join(run,'animal-persistence.json'),JSON.stringify({success:true,worldId:report.worldId,checksumVerified:true,count:22,time:saved.ecology.time,checksum:row.checksum}));}finally{db.close();}}
    if(villageProbe){await stopOwned();const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database,{readOnly:true});try{
      const row=db.prepare('SELECT payload,checksum,revision,world_id FROM village_worlds_v1 WHERE owner=?').get(identity.player);
      if(!row||row.world_id!==report.worldId||report.scope!==report.worldId||row.revision<report.revision)throw new Error('Village world identity or persisted revision mismatch');
      const {tsImport}=await import('tsx/esm/api');const {digest}=await tsImport('../../packages/action-runtime/src/json.ts',import.meta.url);const saved=JSON.parse(row.payload);
      if(digest(saved)!==row.checksum||saved.worldId!==report.worldId||saved.actors.player.equipment!==report.itemId)throw new Error('Village save checksum or authoritative equipment mismatch');
      const release=JSON.parse(readFileSync(path.join(process.env.CAMP_VILLAGE_MODEL_DIR??path.join(root,'public/models/village-v4'),'release.json'),'utf8'));
      for(const head of ['life','tactical'])if(report.models?.[head]?.modelHash!==release.models[head])throw new Error('Native village loaded a different '+head+' model');
      if(args.includes('--village-default')&&!report.defaultMode)throw new Error('Village did not open as the default mode');
      writeFileSync(path.join(run,'village-persistence.json'),JSON.stringify({success:true,worldId:row.world_id,revision:row.revision,checksumVerified:true,itemId:report.itemId,models:report.models,defaultMode:report.defaultMode}));
    }finally{db.close();}}
    if(newWorldProbe){await stopOwned();const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database,{readOnly:true});try{
      const row=db.prepare('SELECT revision,payload,checksum FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(identity.player);
      if(!row||row.revision<2||createHash('sha256').update(row.payload).digest('hex')!==row.checksum)throw new Error('New map live save validation failed');
      process.env.CAMP_WORLD_LAYOUT=layout;const {tsImport}=await import('tsx/esm/api');const {restoreGameState}=await tsImport('../../src/games/camp/simulation/persistence.ts',import.meta.url);const saved=JSON.parse(row.payload);
      if(!restoreGameState(saved.state)||`${saved.journal.generation}:${saved.journal.branch}`!==report.scope)throw new Error('New map live save cannot be restored');
      writeFileSync(path.join(run,'new-world-persistence.json'),JSON.stringify({success:true,revision:row.revision,elapsed:saved.state.elapsed,npcs:saved.state.npcs.length,checksumVerified:true,restorable:true}));
    }finally{db.close();}}
    if(aiProbe){await stopOwned();const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database,{readOnly:true});try{
      const row=db.prepare('SELECT revision,payload,checksum FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(identity.player);
      if(!row||createHash('sha256').update(row.payload).digest('hex')!==row.checksum)throw new Error('Saved world checksum failed');
      const saved=JSON.parse(row.payload);const message=saved.state.socialLife?.messages.find(m=>m.id===report.dialogueId);
      if(!message||message.source!==report.source||message.text!==report.text||`${saved.journal.generation}:${saved.journal.branch}`!==report.scope)throw new Error('Displayed AI reply was not confirmed in saved world');
      writeFileSync(path.join(run,'ai-persistence.json'),JSON.stringify({success:true,revision:row.revision,scope:report.scope,dialogueId:message.id,source:message.source,checksumVerified:true}));
    }finally{db.close();}}
    console.log(JSON.stringify(report));}
  writeFileSync(path.join(run,'launcher-result.json'),JSON.stringify({success:true,kind:process.env.CAMP_UI_LAYOUT_PROBE==='1'?'ui-layout-only':'TS-authoritative-native-slice'}));
}catch(error){writeFileSync(path.join(run,'launcher-result.json'),JSON.stringify({success:false,error:error.message}));console.error(error.message);process.exitCode=1;}
finally{await stopOwned();}
