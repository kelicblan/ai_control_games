import { describe, expect, it } from 'vitest';
import { createActor } from '../../src/games/camp/village/domain/actors';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
const rules = selectWorldRules('village-v1', 'draft-table-v1');
describe('T04 dynamic identities and isolated new worlds', () => {
  it('shares archetype abilities while isolating identity, knowledge and goals', () => {
    const a = createActor('W001', 'person-a', {}), b = createActor('W001', 'person-b', {});
    expect(a.attributes).toEqual(b.attributes); expect(a.id).not.toBe(b.id);
    a.personal.goals.push({ id: 'g', actorId: a.id, kind: 'rest', priority: 1, progress: 0, basisRefs: [], revision: 1, reconsiderOn: [] });
    expect(b.personal.goals).toEqual([]); expect(b.personal.knowledge.evidence).toEqual({});
  });
  it('creates the real P001 player plus ten recruit instances without fixed NPC names', () => {
    const state = createVillageState(rules, { id: 'test', classification: 'fixture', worldId: 'world-test', seed: 17, inventory: { wood: 35 }, actors: Array.from({ length: 10 }, (_, i) => ({ archetypeId: 'W001', instanceId: `recruit-${i}` })) });
    expect(Object.keys(state.actors)).toHaveLength(11);
    expect(state.actors[state.playerId]).toMatchObject({ archetypeId: 'P001', body: { hp: 150, maxHp: 150 }, attributes: { attack: 12 } });
    const restored = restoreVillageState(JSON.parse(JSON.stringify(state)), rules);
    expect(restored).toEqual(state);
    expect(() => restoreVillageState({ version: 1, npcs: [] }, rules)).toThrow();
    expect(() => restoreVillageState({ ...state, ruleHash: '0'.repeat(64) }, rules)).toThrow();
  });
  it('rejects overpopulation, player duplication, bad IDs and corrupt saves', () => {
    expect(() => createActor('W001', '__proto__', {})).toThrow();
    expect(() => createActor('UNKNOWN', 'person', {})).toThrow();
    const spec = { id: 'test', classification: 'fixture' as const, worldId: 'world', seed: 1, inventory: { wood: 0 }, actors: [{ archetypeId: 'W001', instanceId: 'a' }] };
    const state = createVillageState(rules, spec);
    expect(() => createVillageState(rules, { ...spec, actors: [...spec.actors, ...spec.actors] })).toThrow();
    expect(() => createVillageState(rules, { ...spec, actors: Array.from({ length: 11 }, (_, i) => ({ archetypeId: 'W001', instanceId: `a${i}` })) })).toThrow();
    state.actors.a.body.hp = -1; expect(() => restoreVillageState(state, rules)).toThrow();
  });
});
