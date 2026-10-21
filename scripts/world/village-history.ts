// Host checkpoint retention: archive inactive runtime detail after ten seconds.
// Rules, active tasks and every live evidence reference remain authoritative.
import { digest } from '../../packages/action-runtime/src/json';
import type { VillageState } from '../../src/games/camp/village/domain/types';
export interface HistoryBatch { worldId:string;sequence:number;previousHash:string;retiredBeforeTick:number;events:VillageState['events'];executions:VillageState['executions'];operations:VillageState['operations'] }
/** Sink must durably write first, inside the caller's transaction. Failure leaves state intact. */
export function compactRuntimeHistory(state:VillageState,write:(batch:HistoryBatch)=>void,keepRecent=512) {
  const cutoff=state.tick-100;if(cutoff<=0||state.events.length<=keepRecent)return;
  const keep=new Set((keepRecent>0?state.events.slice(-keepRecent):[]).map(e=>e.id)),keepTasks=new Set<string>();
  for(const actor of Object.values(state.actors)){
    for(const goal of actor.personal.goals)goal.basisRefs.forEach(id=>keep.add(id));
    for(const relation of Object.values(actor.personal.relations))relation.basisRefs.forEach(id=>keep.add(id));
  }
  for(const issue of Object.values(state.social.issues))issue.basisRefs.forEach(id=>keep.add(id));
  for(const p of Object.values(state.social.proposals))p.basisRefs.forEach(id=>keep.add(id));
  for(const a of Object.values(state.social.agreements))a.evidenceRefs.forEach(id=>keep.add(id));
  for(const node of Object.values(state.economy?.nodes??{}))if(node.depletedEventId)keep.add(node.depletedEventId);
  for(const c of Object.values(state.economy?.containers??{}))keep.add(c.sourceEventId);
  for(const enemy of Object.values(state.combat?.enemies??{}))if(enemy.deathEventId)keep.add(enemy.deathEventId);
  Object.values(state.combat?.waves??{}).forEach(id=>keep.add(id));
  for(const event of state.events)if(event.kind==='institution.changed'&&state.institutions?.[String(event.facts.institutionId)]?.version===event.facts.version)keep.add(event.id);
  const deliveryOperations = new Set<string>();
  for(const order of Object.values(state.economy?.orders??{})){
    keepTasks.add(order.executionId);
    if(order.deliveryOperationId){deliveryOperations.add(order.deliveryOperationId);const id=state.operations[order.deliveryOperationId]?.receipt.executionId;if(id)keepTasks.add(id);}
  }
  const workshop = state.economy?.workshop;
  if (workshop?.buildExecutionId) keepTasks.add(workshop.buildExecutionId);
  if (workshop?.completedEventId) keep.add(workshop.completedEventId);
  for (const id of workshop?.legacyExecutions ?? []) keepTasks.add(id);
  for (const g of Object.values(state.economy?.journey?.completed ?? {})) {
    keep.add(g.eventId); const facts = state.events.find(e => e.id === g.eventId)?.facts;
    if (typeof facts?.sourceEventId === 'string') keep.add(facts.sourceEventId);
    if (typeof facts?.huntEventId === 'string') keep.add(facts.huntEventId);
  }
  for (const id of Object.values(state.economy?.journey?.hunts ?? {})) keep.add(id);
  for(const task of Object.values(state.executions))if(task.command.planId||['accepted','running'].includes(task.status)||task.command.issuedAtTick===undefined||task.command.issuedAtTick>cutoff)keepTasks.add(task.id);
  for(const id of keepTasks)state.executions[id]?.eventIds.forEach(ref=>keep.add(ref));
  const events=state.events.filter(e=>!keep.has(e.id)),tasks=Object.fromEntries(Object.entries(state.executions).filter(([id])=>!keepTasks.has(id)));
  // Never lose the event required to validate a retained terminal task.
  const operations=Object.fromEntries(Object.entries(state.operations).filter(([id,op])=>!deliveryOperations.has(id)&&op.issuedAtTick!==undefined&&op.issuedAtTick<=cutoff&&(!op.receipt.executionId||!keepTasks.has(op.receipt.executionId))));
  if(!events.length&&!Object.keys(tasks).length&&!Object.keys(operations).length)return;
  const before=state.history??{sequence:0,retiredBeforeTick:0,archivedEvents:0,archivedExecutions:0,chainHash:'0'.repeat(64),segments:[]};
  const batch:HistoryBatch={worldId:state.worldId,sequence:before.sequence+1,previousHash:before.chainHash,retiredBeforeTick:cutoff,events,executions:tasks,operations};
  const hash=digest(batch),chainHash=digest({previous:before.chainHash,hash});write(structuredClone(batch));
  state.events=state.events.filter(e=>keep.has(e.id));for(const id of Object.keys(tasks))delete state.executions[id];for(const id of Object.keys(operations))delete state.operations[id];
  const remainingEvents=new Set(state.events.map(e=>e.id));
  if(state.economy)for(const key of Object.keys(state.economy.xpEvents)){const id=key.slice(0,key.lastIndexOf(':'));if(!remainingEvents.has(id))delete state.economy.xpEvents[key];}
  for(const actor of Object.values(state.actors)){
    const evidence=actor.personal.knowledge.evidence,localKeep=new Set([...keep,...Object.keys(evidence).slice(-64)]);
    for(const entity of Object.values(actor.personal.knowledge.entities)){
      const ref=Object.values(evidence).reverse().find(e=>e.facts.entityId===entity.id&&e.at===entity.at);if(ref)localKeep.add(ref.eventId);
    }
    for(const id of Object.keys(evidence))if(!localKeep.has(id))delete evidence[id];
  }
  state.history={sequence:batch.sequence,retiredBeforeTick:Math.max(before.retiredBeforeTick,cutoff),archivedEvents:before.archivedEvents+events.length,archivedExecutions:before.archivedExecutions+Object.keys(tasks).length,chainHash,segments:[...before.segments,{sequence:batch.sequence,hash,count:events.length,chainHash}].slice(-128)};
}
