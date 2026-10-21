import { expect, it } from 'vitest';
import { appraiseKnownEvent, applyRelationDeltas } from '../../../src/games/camp/village/social/appraisal';
import { createVillageState } from '../../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../../src/games/camp/village/config/load';
import { appendEvent } from '../../../packages/action-runtime/src/runtime';
import { observePersonalEvent } from '../../../packages/social-core/src/knowledge';
it('only known rescue evidence affects directed trust and cannot be farmed', () => {
  const s = createVillageState(selectWorldRules('village-v1', 'p3-defense-alpha-v1'), { id: 'rescue', classification: 'fixture', worldId: 'rescue', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'a' }, { archetypeId: 'W002', instanceId: 'b' }], inventory: {} });
  const e = appendEvent(s, 'actor.rescued', ['player', 'a'], { recipientId: 'a', carrierId: 'player', atShelter: true });
  s.actors.a.personal.knowledge = observePersonalEvent('a', e, s.actors.a.personal.knowledge);
  const deltas = appraiseKnownEvent('a', s.actors.a.personal.knowledge, e.id);
  expect(appraiseKnownEvent('b', s.actors.b.personal.knowledge, e.id)).toEqual([]);
  applyRelationDeltas(s, deltas); const first = s.actors.a.personal.relations.player.trust;
  applyRelationDeltas(s, deltas); expect(s.actors.a.personal.relations.player.trust).toBe(first); expect(first).toBeGreaterThan(.5);
  expect(s.actors.b.personal.relations.player).toBeUndefined();
});
