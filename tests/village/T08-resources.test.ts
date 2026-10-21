import { expect, it } from 'vitest';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy, addResourceNode } from '../../src/games/camp/village/systems/resources';
import { workNode } from '../../src/games/camp/village/systems/gathering';
import { transferResources } from '../../src/games/camp/village/systems/hauling';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
it('depletes source nodes once, preserves overflow, and accounts only actual deposits', () => {
  const state = createVillageState(rules, { id: 'resources', classification: 'experiment', worldId: 'resource-world', seed: 17, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: {} });
  initializeEconomy(state, rules);
  for (const resource of ['wood', 'stone', 'rope'] as const) {
    addResourceNode(state, rules, { id: resource, resource, level: 10, position: { x: 0, y: 0 } });
    const events = workNode(state, 'a', resource, 15360); expect(events.some(e => e.kind === 'node.depleted')).toBe(true);
    workNode(state, 'player', resource, 15360);
    expect(state.economy!.nodes[resource].remainingHp).toBe(0);
  }
  const total = Object.values(state.economy!.containers).reduce((n, c) => n + Object.values(c.resources).reduce((a, b) => a + b, 0), 0) + Object.values(state.actors.a.carried).reduce((a, b) => a + b, 0);
  expect(total).toBe(1536); expect(state.inventory).toEqual({});
  expect(transferResources(state, { operationId: 'deposit', actorId: 'a', destination: 'store' }).accepted).toBe(true);
  expect(state.inventory.wood).toBe(10); expect(state.actors.a.carried).toEqual({});
  expect(transferResources(state, { operationId: 'deposit', actorId: 'a', destination: 'store' }).accepted).toBe(true);
  expect(state.inventory.wood).toBe(10);
  expect(restoreVillageState(JSON.parse(JSON.stringify(state)), rules).economy!.nodes.wood.remainingHp).toBe(0);
});
it('uses source level-one HP 30 and yield 1 for every resource type', () => {
  const state = createVillageState(rules, { id: 'small', classification: 'fixture', worldId: 'small', seed: 1, actors: [], inventory: {} }); initializeEconomy(state, rules);
  for (const resource of ['wood', 'stone', 'rope'] as const) { addResourceNode(state, rules, { id: resource, resource, level: 1, position: { x: 0, y: 0 } }); workNode(state, 'player', resource, 30); expect(state.actors.player.carried[resource]).toBe(1); }
});
