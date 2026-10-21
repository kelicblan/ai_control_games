import type {PolicyInput,ActionCandidate} from '../../packages/policy-runtime/src/types';
import type {VillageState} from '../../src/games/camp/village/domain/types';
import {digest} from '../../packages/action-runtime/src/json';
import {appendEvent} from '../../packages/action-runtime/src/runtime';
import {observePersonalEvent} from '../../packages/social-core/src/knowledge';
const physicalFailure=(reason:string)=>/route|unreachable|cannot reach|not arrived|depleted|not workable|collection conditions changed|related entity changed|无法到达|路线受阻|尚未到达工坊|没有实际搬运/i.test(reason);
const signature=(c:Pick<ActionCandidate,'action'|'parameters'|'targetId'>)=>digest({action:c.action,parameters:c.parameters,targetId:c.targetId??null});
/** Only the actor's own validator replies and failed executions restrict its next attempt. */
export class VillagePolicyFeedback{
 private rejected=new Map<string,Map<string,number>>();
 observedKnowledge(state:VillageState,actorId:string){
  const knowledge=state.actors[actorId].personal.knowledge,invalid=new Set<string>();
  for(const e of Object.values(knowledge.evidence))if(e.kind==='policy.read_rejected'&&typeof e.facts.readKey==='string'){
   const key=e.facts.readKey,id=key.startsWith('node:')?key.slice(5):key,entity=knowledge.entities[id];
   if(entity&&entity.version===e.facts.readVersion)invalid.add(id);
  }
  return invalid.size?{...knowledge,entities:Object.fromEntries(Object.entries(knowledge.entities).filter(([id])=>!invalid.has(id)))}:knowledge;
 }
 remember(state:VillageState,candidate:ActionCandidate,reason:string){
  if(!physicalFailure(reason))return;const key=state.worldId+'|'+candidate.actorId,entries=this.rejected.get(key)??new Map<string,number>();entries.set(signature(candidate),state.elapsed+10);this.rejected.set(key,entries);
  const readKey=/^Related entity changed: (.+)$/.exec(reason)?.[1];
  if(readKey&&Object.hasOwn(candidate.readSet,readKey)){
   // Remember only this actor's rejected read version, never the hidden current entity value.
   const event=appendEvent(state,'policy.read_rejected',[candidate.actorId],{candidateSignature:signature(candidate),readKey,readVersion:candidate.readSet[readKey]});
   const actor=state.actors[candidate.actorId];actor.personal.knowledge=observePersonalEvent(actor.id,event,actor.personal.knowledge);
  }
 }
 mask(state:VillageState,input:PolicyInput):PolicyInput{
  const key=state.worldId+'|'+input.actorId,entries=this.rejected.get(key)??new Map<string,number>();for(const [id,until]of entries)if(until<=state.elapsed)entries.delete(id);
  for(const e of Object.values(state.executions))if(e.command.actorId===input.actorId&&e.status==='failed'&&physicalFailure(e.reason??'')){
   const evidence=state.actors[input.actorId].personal.knowledge.evidence[e.eventIds.at(-1)??''];if(evidence&&evidence.at+10>state.elapsed)entries.set(signature(e.command),evidence.at+10);
  }
  if(entries.size)this.rejected.set(key,entries);else this.rejected.delete(key);
  const stale=Object.values(state.actors[input.actorId].personal.knowledge.evidence).filter(e=>e.kind==='policy.read_rejected');
  return {...input,knownLegalMask:input.knownLegalMask.map((allowed,i)=>{
   const candidate=input.candidates[i];return allowed&&!entries.has(signature(candidate))&&!stale.some(e=>e.facts.candidateSignature===signature(candidate)&&typeof e.facts.readKey==='string'&&candidate.readSet[e.facts.readKey]===e.facts.readVersion);
  })};
 }
}
