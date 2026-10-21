import { canonical, ensure, record } from '../../action-runtime/src/json';
import { validId, type DomainEvent } from '../../action-runtime/src/types';
import type { KnowledgeSnapshot, PersonalState } from './types';

export function observePersonalEvent(actorId: string, event: DomainEvent, knowledge: KnowledgeSnapshot): KnowledgeSnapshot {
  ensure(actorId === knowledge.actorId, 'Knowledge ownership mismatch');
  ensure(validId(event.id) && Number.isFinite(event.at) && event.at >= 0 && Array.isArray(event.participants) && Array.isArray(event.visibleTo), 'Invalid personal event');
  if (!event.visibleTo.includes(actorId) && !event.participants.includes(actorId)) return knowledge;
  const source = event.kind === 'actor.said' || event.kind === 'entity.reported' ? 'reported' : 'observed';
  const evidence = { eventId: event.id, at: event.at, kind: event.kind, source, facts: structuredClone(event.facts) } as const;
  if (Object.hasOwn(knowledge.evidence, event.id)) { ensure(canonical(knowledge.evidence[event.id]) === canonical(evidence), 'Conflicting event identity'); return knowledge; }
  const next = structuredClone(knowledge); next.evidence[event.id] = evidence;
  next.version++; next.observedAt = Math.max(next.observedAt, event.at);
  // A statement about inventory does not become an inventory observation.
  if (['entity.observed', 'entity.reported'].includes(event.kind)) {
    const f = event.facts;
    ensure(validId(f.entityId) && typeof f.entityKind === 'string' && typeof f.entityVersion === 'number' && Number.isSafeInteger(f.entityVersion) && f.entityVersion >= 0 && record(f.entityValues), 'Invalid entity evidence');
    const confidence = source === 'observed' ? 1 : f.confidence;
    ensure(typeof confidence === 'number' && confidence >= 0 && confidence <= 1, 'Reported evidence needs explicit confidence');
    const previous = next.entities[f.entityId];
    if (!previous || previous.at <= event.at && previous.version <= f.entityVersion) next.entities[f.entityId] = {
      id: f.entityId, kind: f.entityKind, at: event.at, version: f.entityVersion, confidence, source, values: structuredClone(f.entityValues),
    };
  }
  return next;
}

export function observePersonalState(actorId: string, event: DomainEvent, personal: PersonalState, evaluation: { aidTrust: number; aidReciprocity: number }): PersonalState {
  ensure([evaluation.aidTrust, evaluation.aidReciprocity].every(n => Number.isFinite(n) && n >= 0 && n <= 1), 'Explicit bounded relationship evaluation required');
  const knowledge = observePersonalEvent(actorId, event, personal.knowledge);
  if (knowledge === personal.knowledge) return personal;
  const next = { ...structuredClone(personal), knowledge };
  if (event.kind === 'aid.completed' && event.facts.recipientId === actorId && validId(event.facts.helperId) && event.facts.helperId !== actorId) {
    const helper = event.facts.helperId;
    const relation = next.relations[helper] ?? { targetId: helper, trust: .5, affinity: .5, reciprocity: .5, rivalry: 0, authority: .5, basisRefs: [] };
    relation.trust = Math.min(1, relation.trust + evaluation.aidTrust);
    relation.reciprocity = Math.min(1, relation.reciprocity + evaluation.aidReciprocity);
    relation.basisRefs.push(event.id); next.relations[helper] = relation;
  }
  return next;
}

export function reviseBelief(actorId: string, evidenceRef: string, knowledge: KnowledgeSnapshot): KnowledgeSnapshot {
  ensure(actorId === knowledge.actorId, 'Belief ownership mismatch');
  const evidence = knowledge.evidence[evidenceRef], facts = evidence?.facts;
  ensure(evidence && evidence.kind === 'entity.observed' && evidence.source === 'observed' && facts && validId(facts.entityId) && typeof facts.entityKind === 'string' && Number.isSafeInteger(facts.entityVersion) && record(facts.entityValues), 'Direct known counterevidence required');
  const current = knowledge.entities[facts.entityId];
  ensure(!current || current.source === 'reported' || current.at <= evidence.at, 'Cannot overwrite a newer direct observation');
  const next = structuredClone(knowledge);
  next.entities[facts.entityId] = { id: facts.entityId, kind: facts.entityKind, at: evidence.at, version: Number(facts.entityVersion), confidence: 1, source: 'observed', values: structuredClone(facts.entityValues) };
  next.version++; return next;
}
