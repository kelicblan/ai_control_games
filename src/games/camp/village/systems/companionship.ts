import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent,type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { distance } from './resources';
import { moveTowards } from './combat-actions';
export const COMPANION_CAPABILITIES:ActionCapability<VillageState>[]=['FOLLOW','ESCORT','SOCIAL_VISIT'].map(id=>({
 id,validate(state,command){const actor=state.actors[command.actorId],target=command.targetId&&state.actors[command.targetId],seconds=command.parameters.seconds;ensure(state.ruleVersion==='p4-social-content-v1'&&target&&target.id!==actor.id&&target.body.hp>0&&distance(actor.position,target.position)<=(id==='SOCIAL_VISIT'?2:12)&&Object.keys(command.parameters).length===1&&typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>=.1&&seconds<=30,'Companion action conditions failed');return{duration:seconds,cost:{}};},
 advance(state,e,dt){const actor=state.actors[e.command.actorId],target=state.actors[e.command.targetId!];ensure(target.body.hp>0,'Companion unavailable');if(id==='SOCIAL_VISIT')ensure(distance(actor.position,target.position)<=2,'Visit interrupted by departure');else if(distance(actor.position,target.position)>1.2)ensure(moveTowards(state,actor.position,target.position,4*actor.attributes.moveSpeed,dt),'Companion route blocked');},
 complete(state,e){const target=state.actors[e.command.targetId!],actor=state.actors[e.command.actorId];ensure(distance(actor.position,target.position)<=3,'Companion not reached');appendEvent(state,id==='SOCIAL_VISIT'?'social.visit_completed':id==='ESCORT'?'actor.escorted':'actor.followed',[actor.id,target.id],{actorId:actor.id,recipientId:target.id,seconds:e.duration},e.id);},
}));
