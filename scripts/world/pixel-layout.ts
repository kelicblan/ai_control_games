import {newWorld} from '../../src/games/camp/world/newWorldProfile';
import {pixelLayout,pixelVillage,pixelBuildings,pixelProject,pixelMigrationProject,fromPreviousMap} from '../../src/games/camp/world/pixel/navigation';
import type {VillageState,Point} from '../../src/games/camp/village/domain/types';
import {cancelExecution} from '../../src/games/camp/village/systems/commands';
import {appendEvent} from '../../packages/action-runtime/src/runtime';
/** Reposition live geography only. Historical commands, receipts and social evidence retain their original coordinates. */
export function attachPixelLayout(state:VillageState){
 if(!pixelLayout)return false;
 const version=state as VillageState&{mapLayout?:string;referenceLayoutVersion?:number};
 if(version.mapLayout==='pixel-world-v1')return migrateReferenceLayout(state);
 const previous=state.actors[state.playerId].position;
 const alreadyPixel=previous.x>10000&&previous.y>10000;
 const project=(p:Point)=>pixelProject(alreadyPixel?p:fromPreviousMap(p));
 const walk=(v:unknown):void=>{if(!v||typeof v!=='object')return;const p=v as Record<string,unknown>;if(typeof p.x==='number'&&typeof p.y==='number'){Object.assign(p,project(p as unknown as Point));return;}for(const item of Object.values(p))walk(item);};
 for(const task of Object.values(state.executions))if(['accepted','running'].includes(task.status))cancelExecution(state,task.id,task.command.actorId,`pixel-layout:${task.id}`);
 for(const actor of Object.values(state.actors)){actor.position=project(actor.position);walk(actor.personal.knowledge.entities);}
 if(state.economy){const e=state.economy;
  for(const node of Object.values(e.nodes))node.position=project(node.position);
  for(const box of Object.values(e.containers))box.position=project(box.position);
  for(const food of Object.values(e.foodSources??{}))food.position=project(food.position);
  e.storePosition=pixelProject(pixelBuildings.find(b=>b.kind==='storehouse')!.door);
  if(e.workshop)e.workshop.position=pixelProject(pixelBuildings.find(b=>b.kind==='workshop')!.door);
 }
 if(state.combat){state.combat.fenceGeometry={center:{x:pixelVillage.x,y:pixelVillage.y},radius:80,kind:'shared-world',gatePosition:{...pixelVillage.gate}};state.combat.navigationRevision++;
  for(const enemy of Object.values(state.combat.enemies))enemy.position=project(enemy.position);
 }
 // Wildlife has nested habitat/intent positions; never translate historical events.
 walk(state.wildlife);state.navigation={mode:'shared-world',routes:{}};state.policyMemo={};
 Object.assign(state,{mapLayout:'pixel-world-v1',referenceLayoutVersion:1,roadLayoutVersion:1,waterLayoutVersion:1});
 appendEvent(state,'world.map_attached',[state.playerId],{layout:'pixel-world-v1',fromPosition:{x:previous.x,y:previous.y},cancelledActiveTasks:true});state.revision++;
 return true;
}

/** Migrate only live geography once; preserve identity, inventory and historical evidence. */
export function migrateReferenceLayout(state:VillageState){
 const version=state as VillageState&{referenceLayoutVersion?:number;roadLayoutVersion?:number;waterLayoutVersion?:number};if(version.referenceLayoutVersion===1)return migrateRoadLayout(state);
 const dx=pixelVillage.x-13824,dy=pixelVillage.y-17408;
 const move=(p:Point)=>pixelMigrationProject({x:Math.max(1,Math.min(31999,p.x+dx)),y:Math.max(1,Math.min(31999,p.y+dy))});
 const walk=(v:unknown):void=>{if(!v||typeof v!=='object')return;const p=v as Record<string,unknown>;
  // Regional identities belong to fixed world cells, so keep their cell anchors while repairing blocked terrain.
  if(typeof p.region==='string'){for(const key of ['home','position'])if(p[key])Object.assign(p[key] as Point,pixelMigrationProject(p[key] as Point));p.intent=null;return;}
  if(typeof p.x==='number'&&typeof p.y==='number'){Object.assign(p,move(p as unknown as Point));return;}for(const child of Object.values(p))walk(child);};
 for(const task of Object.values(state.executions))if(['accepted','running'].includes(task.status))cancelExecution(state,task.id,task.command.actorId,`reference-layout:${task.id}`);
 for(const actor of Object.values(state.actors)){actor.position=move(actor.position);walk(actor.personal.knowledge.entities);}
 if(state.economy){for(const node of Object.values(state.economy.nodes))node.position=move(node.position);for(const box of Object.values(state.economy.containers))box.position=move(box.position);for(const food of Object.values(state.economy.foodSources??{}))food.position=move(food.position);
 for(const site of newWorld?.forestExpansion?.resources??[]){const food=state.economy.foodSources?.[site.id];if(food)food.position={...site.stand};}
 state.economy.storePosition=pixelProject(pixelBuildings.find(b=>b.kind==='storehouse')!.door);if(state.economy.workshop)state.economy.workshop.position=pixelProject(pixelBuildings.find(b=>b.kind==='workshop')!.door);}
 if(state.combat){state.combat.fenceGeometry={center:{x:pixelVillage.x,y:pixelVillage.y},radius:80,kind:'shared-world',gatePosition:{...pixelVillage.gate}};state.combat.navigationRevision++;for(const enemy of Object.values(state.combat.enemies))enemy.position=move(enemy.position);}
 walk(state.wildlife);state.navigation={mode:'shared-world',routes:{}};state.policyMemo={};version.referenceLayoutVersion=1;version.roadLayoutVersion=1;version.waterLayoutVersion=1;
 appendEvent(state,'world.reference_layout_attached',[state.playerId],{version:1,previousVillage:{x:13824,y:17408},village:{x:pixelVillage.x,y:pixelVillage.y}});state.revision++;return true;
}

/** Road rerouting never translates the settlement or rewrites historical evidence. */
function migrateRoadLayout(state:VillageState){
 const version=state as VillageState&{roadLayoutVersion?:number;waterLayoutVersion?:number};if(version.roadLayoutVersion===1&&version.waterLayoutVersion===1)return false;
 const waterUpdate=version.roadLayoutVersion===1;
 for(const task of Object.values(state.executions))if(['accepted','running'].includes(task.status))cancelExecution(state,task.id,task.command.actorId,`road-layout:${task.id}`);
 for(const actor of Object.values(state.actors))actor.position=pixelMigrationProject(actor.position);
 for(const enemy of Object.values(state.combat?.enemies??{}))enemy.position=pixelMigrationProject(enemy.position);
 const repair=(value:unknown):void=>{if(!value||typeof value!=='object')return;const p=value as Record<string,unknown>;for(const [key,child]of Object.entries(p)){if((key==='home'||key==='position')&&child&&typeof child==='object'&&'x' in child&&'y' in child)Object.assign(child,pixelMigrationProject(child as Point));else if(key==='intent')p[key]=null;else repair(child);}};
 repair(state.wildlife);state.navigation={mode:'shared-world',routes:{}};state.policyMemo={};if(state.combat)state.combat.navigationRevision++;
 version.roadLayoutVersion=1;version.waterLayoutVersion=1;appendEvent(state,waterUpdate?'world.water_layout_attached':'world.road_layout_attached',[state.playerId],{version:1});state.revision++;return true;
}
