import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {VillageRuntime} from '../world/village-runtime';import {ensure,digest} from '../../packages/action-runtime/src/json';
const file=path.resolve('native/LocalData/new-world-v1/world.sqlite');
ensure(process.argv.includes('--repair-authorized-nine-person-roster'),'Explicit roster repair required');
const verifyIndex=process.argv.indexOf('--verify-backup');const verifyBackup=verifyIndex>=0?path.resolve(process.argv[verifyIndex+1]):null;
const db=new DatabaseSync(verifyBackup??file,{readOnly:true});let before:any,owner:string,backupFile:string;
try{const rows=db.prepare('SELECT owner,payload FROM village_worlds_v1').all();ensure(rows.length===1,'Expected one primary world');owner=String(rows[0].owner);before=JSON.parse(String(rows[0].payload));ensure(Object.keys(before.actors).length===3&&before.actors['recruit-1']&&before.actors['recruit-2'],'Primary world is not affected');
const directory=path.resolve('native/LocalData/world-reset-backups');mkdirSync(directory,{recursive:true});backupFile=verifyBackup??path.join(directory,'before-roster-repair-'+randomUUID()+'.sqlite');if(!verifyBackup)await backup(db,backupFile);
}finally{db.close();}
if(!verifyBackup){const runtime=new VillageRuntime(file,()=>Date.now(),false);
try{runtime.repairInitialRoster(owner!,before.worldId);}finally{runtime.close();}}
const check=new DatabaseSync(file,{readOnly:true});try{
const after=JSON.parse(String(check.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get(owner!)!.payload));
for(const key of ['worldId','tick','elapsed','paused','inventory','executions','operations','reservations','social','combat'])ensure(digest(before[key]??null)===digest(after[key]??null),`Repair changed ${key}`);
ensure(Object.keys(after.actors).length===10,'Nine companions not restored');
for(const id of ['player','recruit-1','recruit-2']){
 for(const key of ['body','position','equipment','carried'])ensure(digest(before.actors[id][key])===digest(after.actors[id][key]),`Repair changed ${id}.${key}`);
 for(const key of ['goals','relations'])ensure(digest(before.actors[id].personal[key])===digest(after.actors[id].personal[key]),`Repair changed ${id}.personal.${key}`);
}
const report={success:true,backup:backupFile!,worldId:after.worldId,tick:after.tick,elapsed:after.elapsed,inventory:after.inventory,npcs:Object.values(after.actors).filter((a:any)=>a.id!=='player').map((a:any)=>({id:a.id,name:a.name,hp:a.body.hp})),preservedProgress:true};
writeFileSync('native/Artifacts/village/P6/roster-repair.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{check.close();}
