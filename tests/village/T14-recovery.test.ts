import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { applyFenceDamage } from '../../src/games/camp/village/systems/fence';
import { submitCommand, advanceExecutions } from '../../src/games/camp/village/systems/commands';
const rules = selectWorldRules('village-v1', 'p3-defense-alpha-v1');
function world() {
  const s = createVillageState(rules, { id: 'recover', classification: 'fixture', worldId: 'recover', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: { wood: 20, stone: 20, food: 10 } });
  initializeEconomy(s, rules); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 10 }); return s;
}
it('whole fence starts at 200 and breaching changes navigation once without ending the world', () => {
  const s = world(); expect(s.economy!.fence.hp).toBe(200);
  applyFenceDamage(s, 300, 'test-hit'); expect(s.economy!.fence.hp).toBe(0); expect(s.combat!.navigationRevision).toBe(1);
  applyFenceDamage(s, 300, 'test-hit'); expect(s.combat!.navigationRevision).toBe(1); expect(s.paused).toBe(true);
});
it('repair and healing reserve and consume through shared task execution', () => {
  const s = world(); s.economy!.fence.hp = 100; s.actors.a.body.hp = 5;
  const receipt = submitCommand(s, { operationId: 'heal', actorId: 'player', action: 'HEAL', targetId: 'a', parameters: {}, readSet: {}, source: 'player_input' });
  expect(receipt.accepted).toBe(true); expect(s.inventory.food).toBe(10);
  for (let i = 0; i < 60; i++) { s.elapsed += .1; advanceExecutions(s, .1); }
  expect(s.inventory.food).toBe(8); expect(s.actors.a.body.hp).toBe(25);
  expect(submitCommand(s, { operationId: 'heal', actorId: 'player', action: 'HEAL', targetId: 'a', parameters: {}, readSet: {}, source: 'player_input' })).toEqual(receipt);
  expect(s.inventory.food).toBe(8);
});
