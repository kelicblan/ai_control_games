import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {ensure} from '../../packages/action-runtime/src/json';
import {DatabaseSync} from 'node:sqlite';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {VillageRuntime}=await import('../world/village-runtime');const {campaignScenario}=await import('../../src/games/camp/village/scenarios/campaign');const {newWorld,newWorldWalkable}=await import('../../src/games/camp/world/newWorldProfile');const {insideSettlement}=await import('../../src/games/camp/world/settlement');
const directory=path.resolve(process.argv[2]);ensure(directory.startsWith(path.resolve('native/LocalData')+path.sep)&&!existsSync(directory),'New isolated animal fixture directory required');
const forest=JSON.parse(readFileSync('config/animals/habitats-new-world-v1.json','utf8'));const points=forest.trees.flatMap((t:any)=>Array.from({length:8},(_,i)=>({x:t.position.x+Math.cos(i*Math.PI/4)*3,y:t.position.y+Math.sin(i*Math.PI/4)*3}))).filter((p:any)=>!insideSettlement(p.x,p.y)&&newWorldWalkable(p)).sort((a:any,b:any)=>Math.hypot(a.x-newWorld!.gate.x,a.y-newWorld!.gate.y)-Math.hypot(b.x-newWorld!.gate.x,b.y-newWorld!.gate.y));
mkdirSync(directory,{recursive:true});const owner=randomUUID();writeFileSync(path.join(directory,'identity.json'),JSON.stringify({player:owner}));
// A precreated village still needs the original bridge/startup checkpoint. Read-only acceptance copy.
const primaryOwner=JSON.parse(readFileSync('native/LocalData/new-world-v1/identity.json','utf8')).player;
const primary=new DatabaseSync('native/LocalData/new-world-v1/world.sqlite',{readOnly:true});let checkpoint:any;try{checkpoint=JSON.parse(String(primary.prepare('SELECT payload FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(primaryOwner)!.payload));}finally{primary.close();}
const {SnapshotStore}=await import('../world/store');const store=new SnapshotStore(path.join(directory,'world.sqlite'));try{const {journal:_,...copy}=checkpoint;store.save(owner,{...copy,at:Date.now(),pauseUntil:null,pauseOwner:null});}finally{store.close();}
const runtime=new VillageRuntime(path.join(directory,'world.sqlite'),Date.now,false);try{const s=runtime.create(owner,{...campaignScenario('animal-ui-fixture-'+owner.slice(0,8),64138,points[0]),navigationMode:'shared-world'});console.log(JSON.stringify({classification:'declared-forest-spawn-native-ui-fixture-not-primary-save',directory,worldId:s.worldId,position:points[0]}));}finally{runtime.close();}
