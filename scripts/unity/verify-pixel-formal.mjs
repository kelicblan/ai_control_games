import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startFormalMap} from '../pixel-world/formal-host.mjs';
const proofId=Date.now().toString();const root=process.cwd(),run=path.join(root,'native/Artifacts/pixel-formal-verify-'+Date.now()),data=path.join(run,'data');mkdirSync(data,{recursive:true});
const sourceOption=process.argv.indexOf('--source-data');const source=sourceOption>=0?path.resolve(process.argv[sourceOption+1]):path.join(root,'native/LocalData/new-world-v1');copyFileSync(path.join(source,'identity.json'),path.join(data,'identity.json'));
const db=new DatabaseSync(path.join(source,'world.sqlite'),{readOnly:true}),player=JSON.parse(readFileSync(path.join(data,'identity.json'))).player;
const original=JSON.parse(db.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get(player).payload);
db.prepare('VACUUM INTO ?').run(path.join(data,'world.sqlite'));db.close();
let host,c;const request=async(route,body)=>{const r=await fetch(c.endpoint+'/game-api/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-camp-tab':'formal-verification','x-pixel-token':c.token,'x-camp-village-protocol':'1',cookie:'campmind-player='+c.player},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;};
const start=async()=>{host=await startFormalMap({root,run,connectionFile:path.join(run,'connection.json'),dataDirectory:data,offline:true});c=JSON.parse(readFileSync(path.join(run,'connection.json')));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await start();let s=await request('village');assert.equal(s.worldId,original.worldId);assert.equal(Object.keys(s.actors).length,Object.keys(original.actors).length);assert.deepEqual(s.inventory,original.inventory);assert.deepEqual(Object.keys(s.actors),Object.keys(original.actors));
 for(const[id,a]of Object.entries(original.actors)){assert.deepEqual(s.actors[id].body,a.body);assert.deepEqual(s.actors[id].carried,a.carried);assert.equal(s.actors[id].equipment,a.equipment);}
 assert.equal(s.mapLayout,'pixel-world-v1');assert.deepEqual(s.policyErrors,{});assert.ok(s.models.life&&s.models.tactical);
 const settings=await request('cognition-settings');const paused=await request('village',{type:'pause',worldId:s.worldId,revision:s.revision,paused:true});await sleep(500);assert.equal((await request('village')).tick,paused.tick);
 s=await request('village',{type:'pause',worldId:s.worldId,revision:paused.revision,paused:false});
 const receipt=await request('village',{type:'command',worldId:s.worldId,revision:s.revision,command:{operationId:'formal-rest-'+proofId,actorId:'player',issuedAtTick:s.tick,source:'player_input',action:'REST',parameters:{seconds:.2},readSet:{'actor:player':s.versions['actor:player']}}});assert.equal(receipt.accepted,true);
 await sleep(1500);s=await request('village');assert.equal(s.executions[receipt.executionId].status,'completed');
 const before=await request('pixel/snapshot');await request('pixel/input',{x:1,y:0});await sleep(180);await request('pixel/input',{x:0,y:0});await sleep(500);const after=await request('pixel/snapshot');assert.ok(Math.hypot(after.player.x-before.player.x,after.player.y-before.player.y)>0);
 const stopped=await request('pixel/snapshot');await sleep(500);const stoppedAgain=await request('pixel/snapshot');assert.deepEqual(stoppedAgain.player,stopped.player);
 let productionVerified=false;
 if(process.argv.includes('--production')){
  s=await request('village');await request('village',{type:'speed',worldId:s.worldId,revision:s.revision,speed:4});
  const command=async(action,parameters={})=>{s=await request('village');const receipt=await request('village',{type:'command',worldId:s.worldId,revision:s.revision,command:{operationId:'formal-production-'+action.toLowerCase()+'-'+proofId,actorId:'player',issuedAtTick:s.tick,source:'player_input',action,parameters,readSet:{'actor:player':s.versions['actor:player'],'inventory:public':s.versions['inventory:public']}}});assert.equal(receipt.accepted,true,JSON.stringify(receipt));const deadline=Date.now()+360000;
   while(Date.now()<deadline){await sleep(1000);const diagnostics=await request('pixel/diagnostics');assert.deepEqual(diagnostics.errors,{});s=await request('village');const task=s.executions[receipt.executionId];if(!['accepted','running'].includes(task.status)){assert.equal(task.status,'completed',JSON.stringify(task));return receipt;}}
   throw Error('Production timed out');};
  s=await request('village');if(!s.economy.workshop.completedEventId)await command('BUILD_WORKSHOP');
  const recipe=s.uiCatalog.weapons[0];await command('CRAFT',{recipeId:recipe.id,recipientId:'player'});s=await request('village');
  const item=Object.values(s.economy.items).filter(i=>i.recipeId===recipe.id&&i.holderId==='player'&&i.equippedBy===null).at(-1);assert.ok(item);await command('EQUIP',{itemId:item.id});
  s=await request('village');assert.equal(s.actors.player.equipment,item.id);productionVerified=true;
 }
 s=await request('village');s=await request('village',{type:'pause',worldId:s.worldId,revision:s.revision,paused:true});const savedPosition=s.actors.player.position;
 await host.close();host=null;await start();const restarted=await request('village');assert.equal(restarted.worldId,s.worldId);assert.deepEqual(restarted.inventory,s.inventory);assert.deepEqual(restarted.actors.player.position,savedPosition);assert.deepEqual(await request('cognition-settings'),settings);const auditDb=new DatabaseSync(path.join(data,'world.sqlite'),{readOnly:true});try{const live=JSON.parse(auditDb.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get(player).payload);const events=[...live.events,...auditDb.prepare('SELECT payload FROM village_history_v1 WHERE owner=? AND world_id=?').all(player,s.worldId).flatMap(row=>JSON.parse(row.payload).events)];assert.equal(events.filter(e=>e.kind==='world.map_attached').length,1);}finally{auditDb.close();}
 const evidence={passed:true,sourceReadOnly:true,isolatedDatabase:path.join(data,'world.sqlite'),worldId:s.worldId,actorCount:Object.keys(s.actors).length,stockPreserved:true,bodyAndEquipmentPreserved:true,mlpLoaded:true,restCompleted:true,movementAndLeaseVerified:true,pauseVerified:true,restartVerified:true,modelSettingsPreserved:true,productionVerified};writeFileSync(path.join(run,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({run,...evidence}));
}finally{if(host)await host.close();}
