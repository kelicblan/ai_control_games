import{digest,ensure,record}from'../../../../../packages/action-runtime/src/json';
import{validId}from'../../../../../packages/action-runtime/src/types';
import{appendEvent}from'../../../../../packages/action-runtime/src/runtime';
import{observePersonalEvent}from'../../../../../packages/social-core/src/knowledge';
import type{GameState}from'../../simulation/types';
import{readVillageClock}from'./clock';import{createVillageState,restoreVillageState}from'./state';
import{selectWorldRules}from'../config/load';import{initializeEconomy}from'../systems/resources';
import type{Point}from'./types';
export interface MigrationMappings{sourceWorldId:string;actors:Record<string,string>;acknowledgeArchive:boolean;positions?:Record<string,Point>;storePosition?:Point}
export function previewMigration(source:unknown,mappings:MigrationMappings){
 ensure(record(source)&&source.version===1&&Number.isSafeInteger(source.seed)&&Array.isArray(source.npcs)&&typeof source.elapsed==='number'&&Number.isFinite(source.elapsed)&&source.elapsed>=0,'Unsupported legacy schema or clock');
 ensure(validId(mappings.sourceWorldId)&&record(mappings.actors),'Explicit source identity and archetype mappings required');
 const legacy=source as unknown as GameState,rules=selectWorldRules('village-v1','p4-social-content-v1'),blockers:string[]=[],unmapped:string[]=[],warnings:string[]=[];
 if(legacy.npcs.length>10)blockers.push('Legacy population exceeds 10 recruit slots');
 for(const npc of legacy.npcs){if(!validId(npc.id)||!rules.tables.actors.some(a=>a.id===mappings.actors[npc.id]&&a.kind!=='player'))blockers.push(`npcs.${npc.id}: missing archetype mapping`);if(npc.mind)unmapped.push(`npcs.${npc.id}.mind`);if(npc.action||npc.command||npc.manualTarget||npc.wildTask)unmapped.push(`npcs.${npc.id}.unfinished-task`);if((npc.inventory?.wood??0)+(npc.inventory?.food??0)>10)unmapped.push(`npcs.${npc.id}.carry-overflow`);}
 for(const key of ['social','socialLife','agency','world'])if(source[key])unmapped.push(key);
 for(const resource of ['wood','food'])ensure(typeof source[resource]==='number'&&Number.isFinite(source[resource])&&Number(source[resource])>=0,'Invalid legacy resources');
 if(unmapped.length&&!mappings.acknowledgeArchive)blockers.push('Explicit acknowledgement required: unmapped minds, relationships and unfinished work stay in the private archive');
 const old=readVillageClock(legacy.elapsed,{daylightSeconds:420,nightSeconds:180}),elapsed=(old.day-1)*720+(old.isNight?480+old.phaseProgress*240:old.phaseProgress*480);
 warnings.push('Fractional resource remainders are recorded in the archive; integer quantities are floored.');
 warnings.push('Unmapped social records and tasks are preserved verbatim in the private archive and old save; they are not silently treated as completed.');
 warnings.push('Current-day maintenance is carried as settled. New food sites start empty and use the declared refill interval.');
 warnings.push('Logical positions are preserved unless explicitly mapped; terrain compatibility must be reviewed in the preview.');
 return{schemaVersion:1,sourceWorldId:mappings.sourceWorldId,sourceHash:digest(source),ruleVersion:rules.ruleVersion,ruleHash:rules.ruleHash,elapsed:Math.round(elapsed*10)/10,inventory:{wood:Math.floor(legacy.wood),food:Math.floor(legacy.food),stone:0,rope:0,meat:0},blockers,unmapped,warnings};
}
export function migrateToNewWorld(source:unknown,mappings:MigrationMappings,targetWorldId:string,expectedSourceHash:string){
 const report=previewMigration(source,mappings);ensure(!report.blockers.length&&report.sourceHash===expectedSourceHash&&validId(targetWorldId)&&targetWorldId!==mappings.sourceWorldId,'Migration preview blocked, source changed or target is not new');
 const old=source as GameState,rules=selectWorldRules('village-v1',report.ruleVersion);
 const world=createVillageState(rules,{id:'explicit-clone-migration',worldId:targetWorldId,classification:'experiment',seed:old.seed,actors:old.npcs.map(n=>({archetypeId:mappings.actors[n.id],instanceId:n.id,initial:{name:n.name,position:mappings.positions?.[n.id]??n.position,personality:{bravery:n.personality.bravery,diligence:n.personality.diligence,empathy:n.personality.empathy}}})),inventory:report.inventory});
 initializeEconomy(world,rules);world.tick=Math.round(report.elapsed*10);world.elapsed=world.tick*.1;world.economy!.storePosition={...(mappings.storePosition??old.lord?.position??{x:50,y:55})};world.actors.player.position={...world.economy!.storePosition};
 const day=Math.floor(world.elapsed/720)+1;
 for(const site of Object.values(world.economy!.foodSources??{})){site.position.x+=world.economy!.storePosition.x;site.position.y+=world.economy!.storePosition.y;site.remaining=0;site.refilledInterval=Math.floor(world.elapsed/720);}
 for(const npc of old.npcs){
  const actor=world.actors[npc.id];ensure([npc.health,npc.energy,npc.hunger,npc.morale,npc.fear,npc.wetness,npc.trust].every(n=>Number.isFinite(n)&&n>=0&&n<=100),'Invalid legacy actor body');
  actor.body.hp=Math.floor(actor.body.maxHp*npc.health/100);for(const key of ['energy','hunger','morale','fear','wetness']as const)actor.body[key]=npc[key];actor.body.downed=actor.body.hp===0;actor.body.incapacitated=!npc.alive;
  let capacity=10;for(const resource of ['food','wood']){const amount=Math.min(capacity,Math.max(0,Math.floor(npc.inventory?.[resource as 'wood'|'food']??0)));if(amount)actor.carried[resource]=amount;capacity-=amount;}
  const event=appendEvent(world,'migration.actor_snapshot',[npc.id],{sourceHash:report.sourceHash,sourceActorId:npc.id,archetypeId:actor.archetypeId,legacyTrust:npc.trust});actor.personal.knowledge=observePersonalEvent(actor.id,event,actor.personal.knowledge);
  actor.personal.relations.player={targetId:'player',trust:npc.trust/100,affinity:.5,reciprocity:.5,rivalry:0,authority:.5,basisRefs:[event.id]};
 }
 for(const id of Object.keys(world.actors))world.economy!.foodDays[`${id}:${day}`]=true;
 appendEvent(world,'migration.completed',Object.keys(world.actors),{sourceWorldId:mappings.sourceWorldId,sourceHash:report.sourceHash,unmapped:report.unmapped});
 const validated=restoreVillageState(world,rules);
 return{world:validated,report,audit:{schemaVersion:1,sourceHash:report.sourceHash,targetWorldId,report,sourceArchive:structuredClone(source),mapping:structuredClone(mappings)}};
}
