import { expect, it } from 'vitest';
import { deriveStats } from '../../src/games/camp/village/domain/stats';
import { grantExperience, progressionView } from '../../src/games/camp/village/systems/progression';
import { recruit, offerRecruit } from '../../src/games/camp/village/systems/recruitment';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { appendEvent } from '../../packages/action-runtime/src/runtime';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
it('rejects empty deliveries instead of farming experience by depositing nothing', () => {
  const s = createVillageState(rules, { id: 'no-free-xp', classification: 'fixture', worldId: 'no-free-xp', seed: 1, inventory: {}, actors: [] }); initializeEconomy(s, rules);
  const r = submitCommand(s, { operationId: 'empty', actorId: 'player', action: 'DEPOSIT', parameters: {}, readSet: {}, source: 'player_input' });
  expect(r.accepted).toBe(false); expect(s.economy!.experience.player).toBe(0);
});
it('derives source growth once and keeps equipment additive', () => {
  const base = { ...rules.tables.actors[0], hp: 100, attack: 10, defense: 4 };
  expect(deriveStats(base, 10, 'WPN002', rules)).toMatchObject({ hp: 172, attack: 21, defense: 8.5 });
});
it('publishes exact level changes once and projects next gains without changing state', () => {
  const s = createVillageState(rules, { id: 'visible-growth', classification: 'fixture', worldId: 'visible-growth', seed: 1, inventory: {}, actors: [] }); initializeEconomy(s, rules);
  const actor = s.actors.player; actor.body.hp = 10;
  const source = appendEvent(s, 'execution.completed', ['player'], { action: 'CRAFT' });
  const before = deriveStats(actor.attributes, 1, null, rules);
  grantExperience(s, source.id, 'player', 20); grantExperience(s, source.id, 'player', 20);
  const levels = s.events.filter(e => e.kind === 'actor.levelled_up');
  expect(levels).toHaveLength(1);
  expect(levels[0]).toMatchObject({ visibleTo: ['player'], facts: { fromLevel: 1, toLevel: 3, sourceEventId: source.id, experience: 20 } });
  expect(levels[0].facts.gains).toMatchObject({ hp: actor.body.maxHp - before.hp, defense: 1 });
  expect(actor.body.hp).toBe(10);
  const frozen = JSON.stringify(s), view = progressionView(s, 'player');
  expect(view).toMatchObject({ experience: 20, level: 3, currentLevelXp: 0, requiredXp: 10, remainingXp: 10, maxLevel: false });
  expect(view.nextGains?.defense).toBe(.5); expect(view.recent[0]).toMatchObject({ amount: 20, action: 'CRAFT' });
  expect(JSON.stringify(s)).toBe(frozen);
  grantExperience(s, appendEvent(s, 'execution.completed', ['player'], { action: 'CRAFT' }).id, 'player', 100);
  expect(progressionView(s, 'player')).toMatchObject({ level: 10, maxLevel: true, remainingXp: 0, nextGains: null });
  expect(restoreVillageState(JSON.parse(JSON.stringify(s)), rules)).toEqual(s);
});
it('deduplicates contributions and caps recruitment without charging player slots', () => {
  const s = createVillageState(rules, { id: 'growth', classification: 'fixture', worldId: 'growth', seed: 1, inventory: {}, actors: Array.from({ length: 9 }, (_, i) => ({ archetypeId: 'W001', instanceId: `a${i}` })) }); initializeEconomy(s, rules);
  offerRecruit(s, 'offer-a', 'W001', 720); offerRecruit(s, 'offer-b', 'W001', 720);
  expect(recruit(s, 'offer-a').accepted).toBe(true); expect(recruit(s, 'offer-b').accepted).toBe(false); expect(Object.keys(s.actors)).toHaveLength(11);
  const e = appendEvent(s, 'execution.completed', ['a0'], { action: 'GATHER_WOOD' }); const personality = structuredClone(s.actors.a0.personality);
  grantExperience(s, e.id, 'a0', 100); grantExperience(s, e.id, 'a0', 100);
  expect(s.economy!.experience.a0).toBe(100); expect(s.actors.a0.level).toBe(10); expect(s.actors.a0.personality).toEqual(personality);
  expect(restoreVillageState(JSON.parse(JSON.stringify(s)), rules)).toEqual(s);
});
it('only lets a nearby established companion acknowledge a real upgrade and rate limits replies', () => {
  const s = createVillageState(rules, { id: 'witness', classification: 'fixture', worldId: 'witness', seed: 1, inventory: {}, actors: [{ archetypeId: 'W001', instanceId: 'worker' }, { archetypeId: 'W001', instanceId: 'friend', initial: { position: { x: 1, y: 0 } } }, { archetypeId: 'W001', instanceId: 'remote', initial: { position: { x: 50, y: 0 } } }] }); initializeEconomy(s, rules);
  const basis = appendEvent(s, 'social.visit_completed', ['worker', 'friend'], {});
  for (const id of ['friend', 'remote']) s.actors[id].personal.relations.worker = { targetId: 'worker', affinity: .8, trust: .8, reciprocity: .5, rivalry: 0, authority: .5, basisRefs: [basis.id] };
  grantExperience(s, appendEvent(s, 'execution.completed', ['worker'], { action: 'CRAFT' }).id, 'worker', 10);
  grantExperience(s, appendEvent(s, 'execution.completed', ['worker'], { action: 'CRAFT' }).id, 'worker', 10);
  const replies = s.events.filter(e => e.kind === 'progression.acknowledged'); expect(replies).toHaveLength(1); expect(replies[0].facts.speakerId).toBe('friend');
  expect(s.events.find(e => e.id === replies[0].facts.basisRef)?.visibleTo).toContain('friend');
  expect(s.events.find(e => e.id === replies[0].facts.basisRef)?.visibleTo).not.toContain('remote');
});
