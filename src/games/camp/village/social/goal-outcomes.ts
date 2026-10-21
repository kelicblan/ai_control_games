import type{DomainEvent}from'../../../../../packages/action-runtime/src/types';
import{reviseGoal}from'../../../../../packages/social-core/src/goals';
import type{ActorInstance}from'../domain/types';
/** Progress can follow known physical outcomes; new priorities still belong to the actor's reflection. */
export function reflectKnownOutcome(actor:ActorInstance,event:DomainEvent){
 if(!actor.personal.knowledge.evidence[event.id])return;
 for(const goal of [...actor.personal.goals]){
  if(goal.progress>=1||!goal.reconsiderOn.includes(event.kind))continue;
  let progress=goal.progress;
  if(goal.kind==='exploration'&&event.kind==='exploration.completed'&&event.participants[0]===actor.id)progress+=.25;
  if(goal.kind==='rest'&&event.kind==='rest.completed'&&event.participants[0]===actor.id)progress=Math.max(progress,actor.body.energy/100);
  if(goal.kind==='care'&&['actor.healed','actor.rescued'].includes(event.kind)&&event.participants[0]===actor.id&&event.participants[1]!==actor.id)progress+=.5;
  if(goal.kind==='affiliation'&&event.kind==='social.visit_completed')progress+=.5;
  if(goal.kind==='equipment'&&event.kind==='equipment.equipped'&&event.participants[0]===actor.id)progress=1;
  if(progress!==goal.progress)actor.personal.goals=reviseGoal(actor.id,{...goal,progress:Math.min(1,progress),revision:goal.revision+1,basisRefs:[...goal.basisRefs,event.id]},actor.personal.goals,actor.personal.knowledge);
 }
}
