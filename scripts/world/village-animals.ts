import {pixelLayout,pixelProject,pixelMigrationProject,fromPreviousMap,pixelVillage,pixelRoute} from '../../src/games/camp/world/pixel/navigation';
import {moveTowards} from '../../src/games/camp/village/systems/combat-actions';
import {segmentDistance} from '../../packages/world-core/src/steering';
import type {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {findGridRoute} from '../../packages/world-core/src/navigation';
import {digest,ensure} from '../../packages/action-runtime/src/json';
import {appendEvent} from '../../packages/action-runtime/src/runtime';
import {observePersonalEvent} from '../../packages/social-core/src/knowledge';
import type {VillageState} from '../../src/games/camp/village/domain/types';
import {combatEntity,fenceBlocksSegment} from '../../src/games/camp/village/systems/targeting';
import {damageForHit,combatRandom} from '../../src/games/camp/village/systems/combat';
import {routeTo} from '../../src/games/camp/village/systems/navigation';
import {worldCanTraverse} from '../../src/games/camp/world/navigation';
import {wildernessSites} from '../../src/games/camp/world/wildernessSites';
import {newWorld,newWorldWalkable,newWorldHeight} from '../../src/games/camp/world/newWorldProfile';
import {insideSettlement} from '../../src/games/camp/world/settlement';
import {zoneForestAnimals} from '../../src/games/camp/world/forestExpansion';
import {createAnimalWorld,stepAnimals,hurtAnimal,SPECIES,distance,type Human,type Point} from '../../src/games/camp/animals/engine';
import {loadAnimalModel} from '../../src/games/camp/animals/model';
import type {WildlifeAuthority as Saved} from '../../src/games/camp/animals/authority';
import {stepTide} from '../../src/games/camp/animals/tide';
import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {supplement} from '../../src/games/camp/village/systems/resources';
import {grantExperience} from '../../src/games/camp/village/systems/progression';
import {applyFenceDamage} from '../../src/games/camp/village/systems/fence';
import {repairWorldPosition} from '../../src/games/camp/world/navigation';
import {migratePopulation} from '../../src/games/camp/animals/population';
import {activateRegionalWildlife,observeRegionalWildlife} from './pixel-wildlife';
/** Independent ecology extension, committed inside the same VillageRuntime SQLite transaction. */
export class VillageAnimals{
 private model:ReturnType<typeof loadAnimalModel>|null=null;private error='';
 private routeCache=new Map<string,{target:Point;points:Point[];revision:number;until:number}>();
 constructor(private db:DatabaseSync){db.exec('CREATE TABLE IF NOT EXISTS village_animals_v1(world_id TEXT PRIMARY KEY,payload TEXT NOT NULL,checksum TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pixel_wildlife_regions(world_id TEXT NOT NULL,region TEXT NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,PRIMARY KEY(world_id,region))');try{this.model=loadAnimalModel();}catch(e){this.error=e instanceof Error?e.message:String(e);}}
 private regions(s:VillageState){return {
  read:(id:string)=>{const row=this.db.prepare('SELECT payload,checksum FROM pixel_wildlife_regions WHERE world_id=? AND region=?').get(s.worldId,id);if(!row)return undefined;const animals=JSON.parse(String(row.payload));ensure(digest(animals)===row.checksum&&Array.isArray(animals)&&animals.every(a=>a.region===id),'Regional wildlife checkpoint checksum mismatch');if(pixelLayout)for(const a of animals){a.home=pixelMigrationProject(a.home);a.position=pixelMigrationProject(a.position);}return animals;},
  write:(id:string,animals:Saved['ecology']['animals'])=>{this.db.prepare('INSERT INTO pixel_wildlife_regions VALUES(?,?,?,?) ON CONFLICT(world_id,region) DO UPDATE SET payload=excluded.payload,checksum=excluded.checksum').run(s.worldId,id,JSON.stringify(animals),digest(animals));}
 };}
 private canMove(s:VillageState,a:Point,b:Point){if(!s.navigation)return !fenceBlocksSegment(s,a,b);return worldCanTraverse(a,b,s.seed,s.combat?.gateOpen===true||!s.combat||!!s.economy&&s.economy.fence.hp<=0);}
 private load(s:VillageState):Saved|null{
  // The retired procedural map has no six-species habitat contract. Formal Unity uses new-world-v1.
  if(s.wildlife){if(pixelLayout)activateRegionalWildlife(s.wildlife,Object.values(s.actors).filter(a=>a.body.hp>0).map(a=>a.position),this.regions(s));else zoneForestAnimals(s.wildlife,newWorld?.forestExpansion,p=>this.canMove(s,p,p));return s.wildlife;}
  if(!s.navigation||!newWorld)return null;
  const row=this.db.prepare('SELECT payload,checksum FROM village_animals_v1 WHERE world_id=?').get(s.worldId);
  if(row){const saved=JSON.parse(String(row.payload)) as Saved;ensure(digest(saved)===row.checksum&&saved.ecology.version===1,'Animal checkpoint checksum mismatch');migratePopulation(saved.ecology);zoneForestAnimals(saved,newWorld?.forestExpansion,p=>this.canMove(s,p,p));s.wildlife=saved;return saved;}
  const forest=JSON.parse(readFileSync(new URL('../../config/animals/habitats-new-world-v1.json',import.meta.url),'utf8')) as {version:number;layout:string;trees:{position:Point}[]};
  ensure(forest.version===1&&forest.layout==='new-world-v1','Animal forest contract mismatch');
  if(pixelLayout)for(const tree of forest.trees)tree.position=pixelProject(fromPreviousMap(tree.position));
  const candidates=forest.trees.flatMap(t=>Array.from({length:8},(_,i)=>({x:t.position.x+Math.cos(i*Math.PI/4)*3,y:t.position.y+Math.sin(i*Math.PI/4)*3}))).filter(p=>!insideSettlement(p.x,p.y)&&this.canMove(s,p,p)).sort((a,b)=>distance(a,newWorld!.gate)-distance(b,newWorld!.gate));
  const habitats:Point[]=[];for(const p of candidates)if(habitats.every(q=>distance(p,q)>=5))habitats.push(p);
  let water:Point[]=[];
  // Shoreline access uses existing collision heights; never alters terrain or creates water on land.
  if(newWorld&&!pixelLayout)for(let i=0;i<newWorld.walkable.length;i++){if(!newWorld.walkable[i])continue;const p={x:newWorld.minX+i%newWorld.width*newWorld.step,y:newWorld.minY+Math.floor(i/newWorld.width)*newWorld.step};if(insideSettlement(p.x,p.y)||newWorldHeight(p)>2.5)continue;const shore=[{x:p.x+newWorld.step,y:p.y},{x:p.x-newWorld.step,y:p.y},{x:p.x,y:p.y+newWorld.step},{x:p.x,y:p.y-newWorld.step}].some(q=>!newWorldWalkable(q)&&newWorldHeight(q)<1);if(shore&&water.every(q=>distance(p,q)>8))water.push(p);}
  if(pixelLayout)water=Array.from({length:8},(_,i)=>pixelProject({x:pixelVillage.x-70+i*25,y:pixelVillage.y-110}));
  if(!water.length)water=wildernessSites(s.seed).filter(p=>p.kind==='berries').map(p=>p.position); // finite collected rainwater patches for legacy geography
  ensure(habitats.length>=6&&water.length>0,'Six species need accessible forest and water');
  const saved:Saved={ecology:createAnimalWorld(s.seed,habitats,water),hunt:null,operations:{}};saved.ecology.time=s.elapsed;
  zoneForestAnimals(saved,newWorld?.forestExpansion,p=>this.canMove(s,p,p),true);
  for(const a of saved.ecology.animals)a.nextDecision=s.elapsed;
  this.save(s,saved);return saved;
 }
 private save(s:VillageState,v:Saved){migratePopulation(v.ecology);s.wildlife=v;}
 ensure(s:VillageState){return this.load(s);}
 observe(s:VillageState,center:Point,span:number){const v=this.load(s);return v?observeRegionalWildlife(v,center,span,this.regions(s)):[];}
 /** Moving wildlife invalidates a fixed initial travel ETA, not the hit rules. */
 prepareHumanExecutions(s:VillageState){for(const task of Object.values(s.executions)){
  if(task.command.action!=='ATTACK'||!['accepted','running'].includes(task.status)||s.elapsed-task.acceptedAt>=30)continue;
  const target=s.wildlife?.ecology.animals.find(a=>a.id===task.command.targetId&&a.hp>0),actor=combatEntity(s,task.command.actorId);if(!target||!actor)continue;
  if(distance(actor.position,target.position)>actor.stats.range){task.remaining=Math.max(task.remaining,.2);task.duration=Math.max(task.duration,task.remaining);}else task.remaining=Math.min(task.remaining,.1);
 }}
 publicState(s:VillageState){const v=this.load(s);if(!v)return null;return {...v.ecology,hunt:v.hunt,model:this.model?{modelId:'animal-shared-life-combat-v2',modelHash:this.model.hash}:null,policyError:this.error};}
 busy(s:VillageState){return this.load(s)?.hunt?.actorId===s.playerId;}
 cancel(s:VillageState){const v=this.load(s);if(v?.hunt){v.hunt=null;this.save(s,v);}}
 hunt(s:VillageState,targetId:string,operationId:string){const v=this.load(s);ensure(v&&typeof targetId==='string'&&typeof operationId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(operationId),'Invalid hunt');if(v.operations[operationId]){ensure(v.operations[operationId]===targetId,'Hunt operation conflict');return;}
  const a=s.actors[s.playerId],target=v.ecology.animals.find(a=>a.id===targetId);const stats=combatEntity(s,a.id)!.stats;
  ensure(!a.body.downed&&!a.body.incapacitated&&a.body.hp>0&&target&&(target.hp>0||target.carcass>0)&&distance(a.position,target.position)<=Math.max(28,stats.range),'Animal is not visible or hunter unavailable');
  ensure(!v.hunt&&!Object.values(s.executions).some(e=>e.command.actorId===a.id&&['accepted','running'].includes(e.status)),'Hunter is busy');
  v.hunt={actorId:a.id,targetId,phase:target.hp>0?'pursue':'collect',until:s.elapsed+90,attackAt:0,route:[],routeAt:0,operationId,blocked:0};v.operations[operationId]=targetId;while(Object.keys(v.operations).length>256)delete v.operations[Object.keys(v.operations)[0]];this.save(s,v);
 }
 step(s:VillageState){const v=this.load(s);if(!v)return;
  const humans:Human[]=Object.values(s.actors).filter(a=>a.body.hp>0&&!a.body.incapacitated).map(a=>{const stats=combatEntity(s,a.id)!.stats;return {id:a.id,position:a.position,hp:a.body.hp,attack:stats.attack,defense:stats.defense,range:stats.range};});
  const emit=(kind:string,actor:string,target:string,amount:number)=>{const e=appendEvent(s,kind,[actor],{animalId:target,amount});e.visibleTo=humans.filter(h=>{const a=v.ecology.animals.find(a=>a.id===target);return a&&distance(h.position,a.position)<28&&this.canMove(s,h.position,a.position);}).map(h=>h.id);for(const id of new Set([...e.visibleTo,...e.participants]))if(s.actors[id])s.actors[id].personal.knowledge=observePersonalEvent(id,e,s.actors[id].personal.knowledge);if(kind==='wildlife.hunt_completed'&&amount>0){const xp=supplement<{xpSources:Record<string,number>}>(selectWorldRules('village-v1',s.ruleVersion),'D14').xpSources.combat;if(xp)grantExperience(s,e.id,actor,xp);}};
  const gate=newWorld?.gate??s.combat!.fenceGeometry.gatePosition??{x:s.combat!.fenceGeometry.center.x+s.combat!.fenceGeometry.radius,y:s.combat!.fenceGeometry.center.y},center=newWorld?.spawn??s.combat!.fenceGeometry.center,dx=gate.x-center.x,dy=gate.y-center.y,len=Math.max(.01,Math.hypot(dx,dy)),normal={x:dx/len,y:dy/len};
  const project=(p:Point)=>s.navigation?repairWorldPosition(p,s.seed,false):p;
  const attackPoint=project({x:gate.x+normal.x*3.05,y:gate.y+normal.y*3.05}),gather=project({x:gate.x+normal.x*14,y:gate.y+normal.y*14});
  const previousAlert=v.ecology.tide?.alert?.id;
  stepTide(v.ecology,{gate:attackPoint,approach:gather,objective:s.combat?.gateOpen||s.economy!.fence.hp<=0?s.economy!.storePosition:attackPoint,humans,visible:(a,b)=>this.canMove(s,a,b),gateBreached:s.economy!.fence.hp<=0});
  const alert=v.ecology.tide?.alert;
  if(alert&&alert.id!==previousAlert&&!s.events.some(e=>e.kind==='wildlife.warning'&&e.facts.tideId===v.ecology.tide!.id&&e.facts.phase===alert.phase)){const event=appendEvent(s,'wildlife.warning',Object.keys(s.actors),{tideId:v.ecology.tide!.id,phase:alert.phase,text:alert.title,direction:alert.direction,severity:alert.severity,observerId:alert.observerId});for(const a of Object.values(s.actors))a.personal.knowledge=observePersonalEvent(a.id,event,a.personal.knowledge);}
  if(!s.combat?.gateOpen&&s.economy!.fence.hp>0)humans.push({id:'structure:gate',kind:'gate',position:attackPoint,hp:s.economy!.fence.hp,attack:0,defense:12,range:0});
  const next=v.ecology.time+.1,slot=Math.round(next*10)%10;
  for(const a of v.ecology.animals){let hash=0;for(const c of a.id)hash=(hash*31+c.charCodeAt(0))%10;const wait=(hash-slot+10)%10;
   if(a.hp>0&&wait>0&&a.alertUntil<=v.ecology.time&&(a.nextDecision<=next||!a.intent)){a.nextDecision=next+wait*.1;a.intent??={action:'rest',target:{...a.position},targetId:null};}
  }
  const before=v.ecology.sequence;
  stepAnimals(v.ecology,humans,.1,(a,b)=>this.canMove(s,a,b),this.model?(o,a)=>{const c=this.model!.decide(o);if(['chase','stalk','home','flee'].includes(c.action)&&distance(a.position,c.target)>3){const key=s.worldId+':'+a.id,revision=s.combat?.navigationRevision??0;let route=this.routeCache.get(key);if(!route||route.revision!==revision||route.until<v.ecology.time||distance(route.target,c.target)>(pixelLayout?3:1)){route={target:{...c.target},points:s.navigation?(pixelLayout?pixelRoute(a.position,c.target,s.combat?.gateOpen===true||s.economy!.fence.hp<=0,512,512):distance(a.position,c.target)>128?routeTo(s,a.position,c.target):findGridRoute(a.position,c.target,(p,q)=>this.canMove(s,p,q),{step:1,maxNodes:1024,maxDistance:128}).points):[{...c.target}],revision,until:v.ecology.time+(pixelLayout?10:distance(a.position,c.target)>128?30:2)};if(this.routeCache.size>220)this.routeCache.clear();this.routeCache.set(key,route);}while(route.points.length&&distance(a.position,route.points[0])<=.25)route.points.shift();const q=route.points[0];if(q&&this.canMove(s,a.position,q))c.target={...q};}return c;}:undefined,this.model?'mlp':'teacher',(id,damage,attacker)=>{if(id==='structure:gate'){applyFenceDamage(s,damage,`wildlife:${attacker}:${s.tick}`);return;}const a=s.actors[id];a.body.hp=Math.max(0,a.body.hp-damage);if(!a.body.hp){a.body.downed=true;if(s.combat)s.combat.downedAt[id]??=s.elapsed;}s.versions[`actor:${id}`]++;emit('wildlife.human_hit',id,attacker,damage);},(animal,from,to)=>{const peers=[...v.ecology.animals.filter(a=>a.hp>0&&a.id!==animal.id).map(a=>a.position),...humans.filter(h=>h.hp>0&&!h.kind).map(h=>h.position)];return peers.every(p=>segmentDistance(from,to,p)>=.55-1e-8||(distance(from,p)<.55&&distance(to,p)>distance(from,p)+1e-8&&segmentDistance(from,to,p)>=distance(from,p)-1e-8));});
  for(const e of v.ecology.events.filter(e=>e.id>before&&e.kind==='animal.died'))emit('wildlife.death',e.actor,e.target!,e.amount);
  for(const a of v.ecology.animals)if(a.hp<=0&&a.carcass>=1&&a.attacker&&s.actors[a.attacker]&&a.attacker!==s.playerId){
   const id='wildlife-loot:'+a.id;if(!s.economy!.containers[id]){const event=appendEvent(s,'wildlife.harvested',[a.attacker],{animalId:a.id,containerId:id,amount:Math.floor(a.carcass)});s.economy!.containers[id]={id,position:{...a.position},resources:{meat:Math.floor(a.carcass)},sourceEventId:event.id};s.versions['container:'+id]=0;const xp=supplement<{xpSources:Record<string,number>}>(selectWorldRules('village-v1',s.ruleVersion),'D14').xpSources.combat;if(xp)grantExperience(s,event.id,a.attacker,xp);}a.carcass=0;
  }
  const job=v.hunt;if(job){const actor=s.actors[job.actorId],target=v.ecology.animals.find(a=>a.id===job.targetId)!;const stats=combatEntity(s,actor.id)!.stats;
   if(s.elapsed>job.until||actor.body.downed||actor.body.incapacitated||actor.body.hp<=0){emit('wildlife.hunt_stopped',actor.id,target.id,0);v.hunt=null;}
   else if(target.hp<=0&&distance(actor.position,target.position)<=1){const capacity=supplement<{carryCapacity:number}>(selectWorldRules('village-v1',s.ruleVersion),'D17').carryCapacity-Object.values(actor.carried).reduce((a,b)=>a+b,0),n=Math.max(0,Math.min(Math.floor(target.carcass),capacity));if(n>0){actor.carried.meat=(actor.carried.meat??0)+n;target.carcass-=n;s.versions[`actor:${actor.id}`]++;emit('wildlife.hunt_completed',actor.id,target.id,n);}v.hunt=null;}
   else if(target.hp>0&&distance(actor.position,target.position)<=stats.range&&this.canMove(s,actor.position,target.position)){
    job.phase='attack';if(s.elapsed>=job.attackAt){job.attackAt=s.elapsed+1/stats.attackSpeed;const hit=combatRandom(s)<Math.max(.05,Math.min(.98,stats.hitRate));const critical=hit&&combatRandom(s)<stats.critRate;const damage=hit?damageForHit(stats.attack,SPECIES[target.species].defense,critical,stats.critMultiplier):0;if(hit)hurtAnimal(v.ecology,target,damage,actor.id);actor.body.energy=Math.max(0,actor.body.energy-.5);s.versions[`actor:${actor.id}`]++;emit(hit?'wildlife.hunt_hit':'wildlife.hunt_missed',actor.id,target.id,damage);}
   }else{job.phase=target.hp>0?'pursue':'collect';if(s.elapsed>=job.routeAt){job.route=routeTo(s,actor.position,target.position);job.routeAt=s.elapsed+2;}while(job.route.length&&distance(actor.position,job.route[0])<.15)job.route.shift();const p=job.route[0];if(p){if(moveTowards(s,actor.position,p,2.8,.1)){s.versions[`actor:${actor.id}`]++;job.blocked=0;}else job.blocked++;}else job.blocked++;if(job.blocked>=30){emit('wildlife.hunt_route_blocked',actor.id,target.id,0);v.hunt=null;}}
  }
  this.save(s,v);
 }
}
