import {readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {digest,ensure} from '../../packages/action-runtime/src/json';

const root=process.cwd(),run=path.resolve(process.argv[2]??'');
ensure(run.startsWith(path.join(root,'native/Artifacts/slice-')),'Formal launch receipt required');
const info=JSON.parse(readFileSync(path.join(run,'processes.json'),'utf8'));
ensure(path.resolve(info.database)===path.join(root,'native/LocalData/new-world-v1/world.sqlite'),'Formal persistent database required');
const owner=JSON.parse(readFileSync(path.join(path.dirname(info.database),'identity.json'),'utf8')).player;
const response=await fetch(info.endpoint+'/game-api/village',{headers:{'x-camp-tab':'formal-upgrade-verification','x-camp-village-protocol':'1',cookie:`campmind-player=${owner}`},signal:AbortSignal.timeout(10000)});
ensure(response.ok,'Formal world endpoint unavailable');const live=await response.json();
const marker=JSON.parse(readFileSync('native/Builds/village-current.json','utf8'));
ensure(info.executable===marker.executable&&live.worldId.startsWith('migrated-')&&Object.keys(live.actors).length===10,'Formal game has not upgraded the original nine people');
for(const head of ['life','tactical'])ensure(live.models[head].modelHash===marker.models[head],'Formal game loaded a different model');
if(marker.animalModelHash)ensure(live.ecology?.animals?.length===22&&new Set(live.ecology.animals.map((a:any)=>a.species)).size===6&&live.ecology.model?.modelHash===marker.animalModelHash&&!live.ecology.policyError,'Formal six-species animal model is not active');
const db=new DatabaseSync(info.database,{readOnly:true});
try{
 const row=db.prepare('SELECT payload,checksum FROM village_migration_v1 WHERE owner=? AND target_world_id=?').get(owner,live.worldId)!;
 const audit=JSON.parse(row.payload as string);ensure(digest(audit)===row.checksum&&digest(audit.sourceArchive)===audit.sourceHash,'Formal original save archive failed verification');
 const old=JSON.parse(db.prepare('SELECT payload FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(owner)!.payload as string).state;
 ensure(digest(old)===audit.sourceHash,'Formal legacy source changed after upgrade');
 const proof={success:true,formalPersistentGame:true,automaticUpgrade:true,npcCount:9,worldId:live.worldId,sourceArchiveVerified:true,legacyFrozen:true,sourceHash:audit.sourceHash,importedInventory:audit.report.inventory,models:live.models,checkedUtc:new Date().toISOString()};
 if(marker.animalModelHash)Object.assign(proof,{animalCount:live.ecology.animals.length,animalSpecies:[...new Set(live.ecology.animals.map((a:any)=>a.species))],animalModel:live.ecology.model,paused:live.paused});
 writeFileSync('native/Artifacts/village/P6/formal-live-upgrade.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{db.close();}
