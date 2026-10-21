import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Checkpoint } from '../world/store';
import { digest, ensure } from '../../packages/action-runtime/src/json';

// Isolated acceptance copy; the player's live database is opened read-only.
const root=process.cwd(),directory=path.resolve(process.argv[2]??'');
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {SnapshotStore}=await import('../world/store');
ensure(directory.startsWith(path.join(root,'native/LocalData')+path.sep)&&!existsSync(directory),'A new isolated local data directory is required');
const primary=path.join(root,'native/LocalData/new-world-v1');
const beforeReset=process.argv.includes('--pre-reset-backup');
const sourceDatabase=beforeReset?path.resolve(JSON.parse(readFileSync('native/Artifacts/village/P6/reset-backup.json','utf8')).backup):path.join(primary,'world.sqlite');
if(beforeReset)ensure(sourceDatabase.startsWith(path.join(root,'native/LocalData/world-reset-backups')+path.sep),'Only the private pre-reset backup may be selected');
let source:Checkpoint|undefined;
if(existsSync(path.join(primary,'identity.json'))&&existsSync(path.join(primary,'world.sqlite'))){
 const owner=JSON.parse(readFileSync(path.join(primary,'identity.json'),'utf8')).player;
 const db=new DatabaseSync(sourceDatabase,{readOnly:true});
 try{const row=db.prepare('SELECT payload FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(owner);if(row)source=JSON.parse(row.payload as string);}finally{db.close();}
}
const sourceKind=source?.state.npcs.length===9?(beforeReset?'read-only-pre-reset-original-save-backup-copy':'read-only-original-save-copy'):'declared-synthetic-nine-person-fixture';
if(source?.state.npcs.length!==9){
 const {createGame}=await import('../../src/games/camp/simulation/engine');const state=createGame({seed:17});state.elapsed=3377.3;state.wood=14;state.food=8;state.status='paused';
 source={version:1,state,revision:1,speed:1,at:Date.now(),pauseUntil:null,pauseOwner:null};
}
mkdirSync(directory,{recursive:true});const identity={player:randomUUID()};writeFileSync(path.join(directory,'identity.json'),JSON.stringify(identity));
const store=new SnapshotStore(path.join(directory,'world.sqlite'));
try{const {journal:_,...copy}=source;store.save(identity.player,{...copy,at:Date.now(),pauseUntil:null,pauseOwner:null});}finally{store.close();}
writeFileSync(path.join(directory,'upgrade-source.json'),JSON.stringify({sourceKind,sourceHash:digest(source.state),npcIds:source.state.npcs.map(n=>n.id),wood:source.state.wood,food:source.state.food,elapsed:source.state.elapsed}));
console.log(JSON.stringify({directory,npcCount:9,sourceKind,sourceHash:digest(source.state)}));
