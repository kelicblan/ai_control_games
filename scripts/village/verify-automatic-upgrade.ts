import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { digest, ensure } from '../../packages/action-runtime/src/json';

const root=process.cwd(),run=path.resolve(process.argv[2]??'');
ensure(run.startsWith(path.join(root,'native/Artifacts/slice-')),'Native probe run required');
const json=(name:string)=>JSON.parse(readFileSync(path.join(run,name),'utf8'));
const result=json('village-result.json'),processInfo=json('processes.json');
ensure(result.success&&result.automaticUpgrade&&result.startupIncluded,'Normal startup must automatically upgrade the old world');
const directory=path.dirname(path.resolve(processInfo.database));
ensure(directory.startsWith(path.join(root,'native/LocalData')+path.sep),'Local acceptance save required');
const source=JSON.parse(readFileSync(path.join(directory,'upgrade-source.json'),'utf8'));
const owner=JSON.parse(readFileSync(path.join(directory,'identity.json'),'utf8')).player;
const db=new DatabaseSync(processInfo.database,{readOnly:true});
try{
 const row=db.prepare('SELECT payload,checksum FROM village_migration_v1 WHERE owner=? AND target_world_id=?').get(owner,result.worldId);ensure(row,'Atomic source archive missing');
 const audit=JSON.parse(row.payload as string);ensure(digest(audit)===row.checksum&&digest(audit.sourceArchive)===audit.sourceHash,'Source archive checksum mismatch');
 ensure(audit.sourceHash===source.sourceHash,'Source copy was changed before upgrading');
 const world=JSON.parse(db.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get(owner)!.payload as string);
 ensure(Object.keys(world.actors).length===10&&source.npcIds.every((id:string)=>world.actors[id]?.name===audit.sourceArchive.npcs.find((n:any)=>n.id===id)?.name),'Original nine identities were lost');
 ensure(audit.report.inventory.wood===Math.floor(source.wood)&&audit.report.inventory.food===Math.floor(source.food),'Imported stock changed');
 ensure(Object.keys(world.combat.waves).length===0&&Math.abs(world.combat.waveEpoch-audit.report.elapsed)<1e-7,'Historical wolves were backfilled');
 const legacy=db.prepare('SELECT payload FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(owner)!;
 ensure(digest(JSON.parse(legacy.payload as string).state)===source.sourceHash,'Hidden legacy simulation changed after upgrade');
 const proof={success:true,automaticUpgrade:true,npcCount:9,sourceArchiveVerified:true,legacyFrozen:true,inventoryVerified:true,historicalWavesSkipped:true,worldId:world.worldId,sourceHash:source.sourceHash};
 writeFileSync(path.join(run,'automatic-upgrade.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{db.close();}
