import {existsSync,mkdirSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {launchEditorWorld} from '../unity/editor-world-host.mjs';
export async function startFormalMap({root,run,connectionFile,dataDirectory=path.join(root,'native/LocalData/new-world-v1'),offline=false}){
 const token=randomBytes(32).toString('hex');let backup=null;
 const host=await launchEditorWorld({root,dataDirectory,runDirectory:run,layout:'pixel-world-v1',offline,environment:{CAMP_PIXEL_TOKEN:token,CAMP_VILLAGE_DEFAULT:'1',CAMP_VILLAGE_EXPERIMENTAL:'1',CAMP_VILLAGE_OFFLINE_PROGRESS:'0'},beforeStart(file,player){
  if(!existsSync(file))return;const db=new DatabaseSync(file);try{
   const table=db.prepare("SELECT name FROM sqlite_master WHERE name='village_worlds_v1'").get();
   const row=table?db.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get(player):null;
   if(!row||JSON.parse(row.payload).mapLayout!=='pixel-world-v1'||JSON.parse(row.payload).referenceLayoutVersion!==1||JSON.parse(row.payload).roadLayoutVersion!==1||JSON.parse(row.payload).waterLayoutVersion!==1){
    backup=path.join(dataDirectory,'backups',`world-before-pixel-gameplay-${Date.now()}.sqlite`);mkdirSync(path.dirname(backup),{recursive:true});db.prepare('VACUUM INTO ?').run(backup);
   }
  }finally{db.close();}
 }});
 try{
  const response=await fetch(host.endpoint+'/game-api/village',{method:'POST',headers:{'content-type':'application/json','x-camp-tab':'pixel-launch','x-camp-village-protocol':'1',cookie:`campmind-player=${host.player}`},body:JSON.stringify({type:'ensure-upgraded'}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok)throw Error(result.error??'正式世界初始化失败');
  // Force migration on a normal read before the client can send movement.
  const check=await fetch(host.endpoint+'/game-api/pixel/snapshot',{headers:{'x-camp-tab':'pixel-launch','x-pixel-token':token,cookie:`campmind-player=${host.player}`},signal:AbortSignal.timeout(30000)});
  if(!check.ok)throw Error((await check.json()).error??'正式地图初始化失败');
  writeFileSync(connectionFile,JSON.stringify({protocol:1,scope:'pixel-game',endpoint:host.endpoint,token,pid:host.pid,formal:true,player:host.player}),{mode:0o600});
  writeFileSync(path.join(run,'formal-attachment.json'),JSON.stringify({database:host.database,player:host.player,pid:host.pid,backup,layout:'pixel-world-v1'}));
  let closed=false;return {database:host.database,get closed(){return closed;},async close(){closed=true;await host.stop();if(existsSync(connectionFile)&&JSON.parse(readFileSync(connectionFile,'utf8')).token===token)unlinkSync(connectionFile);}};
 }catch(error){await host.stop();throw error;}
}
