import type{VillageState}from'../../src/games/camp/village/domain/types';import{appendEvent}from'../../packages/action-runtime/src/runtime';import{observePersonalEvent}from'../../packages/social-core/src/knowledge';
/** A visible stationary combatant remains visible. Re-observation is personal evidence, never remote truth. */
export function maintainCombatSight(state:VillageState){
 for(const actor of Object.values(state.actors))if(actor.body.hp>0)for(const entity of Object.values(actor.personal.knowledge.entities)){
  if(!['enemy','ally'].includes(entity.kind)||state.elapsed-entity.at<2)continue;
  const physical=entity.kind==='enemy'?(state.combat?.enemies[entity.id]??state.wildlife?.ecology.animals.find(a=>a.id===entity.id)):state.actors[entity.id];
  if(!physical||Math.hypot(actor.position.x-physical.position.x,actor.position.y-physical.position.y)>12)continue;
  const event=appendEvent(state,'entity.observed',[actor.id],{entityId:entity.id,entityKind:entity.kind,entityVersion:entity.version,entityValues:{...entity.values}});
  actor.personal.knowledge=observePersonalEvent(actor.id,event,actor.personal.knowledge);
 }
}
