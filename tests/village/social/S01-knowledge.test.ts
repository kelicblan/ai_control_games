import { describe, expect, it } from 'vitest';
import { observePersonalEvent, observePersonalState } from '../../../packages/social-core/src/knowledge';
import { reviseGoal } from '../../../packages/social-core/src/goals';
import { projectSocialContext } from '../../../src/games/camp/village/social/policy-projection';
import { createActor } from '../../../src/games/camp/village/domain/actors';
import type { DomainEvent } from '../../../packages/action-runtime/src/types';
const event: DomainEvent = { id: 'ev1', at: 0, kind: 'aid.completed', participants: ['a', 'b'], visibleTo: ['a', 'b'], facts: { helperId: 'a', recipientId: 'b' } };
describe('S01 finite personal knowledge and directed social feedback', () => {
  it('does not leak unseen events and deduplicates an experienced event', () => {
    const a = createActor('W001', 'a', {}), c = createActor('W001', 'c', {});
    expect(observePersonalEvent('c', event, c.personal.knowledge)).toBe(c.personal.knowledge);
    const known = observePersonalEvent('a', event, a.personal.knowledge);
    expect(known.evidence.ev1).toBeDefined();
    expect(observePersonalEvent('a', event, known)).toBe(known);
    expect(() => observePersonalEvent('b', event, a.personal.knowledge)).toThrow();
  });
  it('changes only the recipient relationship and its candidate projection', () => {
    const a = createActor('W001', 'a', {}), b = createActor('W001', 'b', {}), c = createActor('W001', 'c', {});
    const before = structuredClone(b);
    b.personal = observePersonalState('b', event, b.personal, { aidTrust: .1, aidReciprocity: .1 });
    expect(b.personal.relations.a.trust).toBeGreaterThan(.5);
    expect(projectSocialContext('b', b.personal.knowledge, b.personal.goals, b.personal.relations, 'a').trust_target).toBeGreaterThan(.5);
    expect(a.personal.relations).toEqual({}); expect(c.personal.knowledge.evidence).toEqual({});
    expect(b.attributes).toEqual(before.attributes); expect(b.body).toEqual(before.body);
    expect(observePersonalState('b', event, b.personal, { aidTrust: .1, aidReciprocity: .1 })).toBe(b.personal);
  });
  it('treats claims as claims and rejects unsupported goal ownership and evidence', () => {
    const a = createActor('W001', 'a', {});
    const claim = { ...event, id: 'claim', kind: 'actor.said', facts: { entityId: 'public-store', entityKind: 'store', entityVersion: 0, entityValues: { wood: 999 }, text: '交弓已完成' } };
    const known = observePersonalEvent('a', claim, a.personal.knowledge);
    expect(known.entities['public-store']).toBeUndefined(); expect(known.evidence.claim.source).toBe('reported');
    const goal = { id: 'g1', actorId: 'a', kind: 'rest', priority: .7, progress: 0, basisRefs: ['claim'], revision: 1, reconsiderOn: ['injury'] };
    expect(reviseGoal('a', goal, [], known)[0]).toEqual(goal);
    expect(() => reviseGoal('b', goal, [], known)).toThrow();
    expect(() => reviseGoal('a', { ...goal, basisRefs: ['hidden'] }, [], known)).toThrow();
  });
});
