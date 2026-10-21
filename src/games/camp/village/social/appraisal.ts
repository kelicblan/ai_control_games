import type { KnowledgeSnapshot } from '../../../../../packages/social-core/src/types';
import type { VillageState } from '../domain/types';
import { ensure } from '../../../../../packages/action-runtime/src/json';
export interface RelationDelta { actorId: string; targetId: string; evidenceRef: string; trust: number; reciprocity: number; affinity?:number }
export function appraiseKnownEvent(actorId: string, knowledge: KnowledgeSnapshot, eventId: string): RelationDelta[] {
  ensure(actorId === knowledge.actorId, 'Appraisal ownership mismatch');
  const evidence = knowledge.evidence[eventId]; if (!evidence) return [];
  if(evidence.kind==='social.visit_completed'&&Number(evidence.facts.seconds)>=5){const peer=evidence.facts.actorId===actorId?evidence.facts.recipientId:evidence.facts.recipientId===actorId?evidence.facts.actorId:undefined;if(typeof peer==='string'&&peer!==actorId)return[{actorId,targetId:peer,evidenceRef:eventId,trust:0,reciprocity:0,affinity:.01}];}
  if (evidence.kind !== 'actor.rescued' || evidence.facts.atShelter !== true || evidence.facts.recipientId !== actorId || typeof evidence.facts.carrierId !== 'string' || evidence.facts.carrierId === actorId) return [];
  return [{ actorId, targetId: evidence.facts.carrierId, evidenceRef: eventId, trust: .05, reciprocity: .05 }];
}
export function applyRelationDeltas(state: VillageState, deltas: RelationDelta[]) {
  for (const delta of deltas) {
    const personal = state.actors[delta.actorId]?.personal;
    ensure(personal && state.actors[delta.targetId] && personal.knowledge.evidence[delta.evidenceRef], 'Relationship evidence unavailable');
    const expected = appraiseKnownEvent(delta.actorId, personal.knowledge, delta.evidenceRef).find(d => d.targetId === delta.targetId);
    ensure(expected && expected.trust === delta.trust && expected.reciprocity === delta.reciprocity&&(expected.affinity??0)===(delta.affinity??0), 'Invalid appraisal delta');
    const relation = personal.relations[delta.targetId] ??= { targetId: delta.targetId, trust: .5, affinity: .5, reciprocity: .5, rivalry: 0, authority: .5, basisRefs: [] };
    if (relation.basisRefs.includes(delta.evidenceRef)) continue;
    if(delta.affinity){const day=Math.floor(personal.knowledge.evidence[delta.evidenceRef].at/720),count=relation.basisRefs.filter(id=>{const e=personal.knowledge.evidence[id];return e?.kind==='social.visit_completed'&&Math.floor(e.at/720)===day;}).length;if(count>=3)continue;relation.affinity=Math.min(1,relation.affinity+delta.affinity);}
    relation.trust = Math.max(0, Math.min(1, relation.trust + delta.trust)); relation.reciprocity = Math.max(0, Math.min(1, relation.reciprocity + delta.reciprocity)); relation.basisRefs.push(delta.evidenceRef);
  }
}
