import { expect, it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { createOrder } from '../../src/games/camp/village/systems/orders';
import { cancelExecution } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { handoverItem } from '../../src/games/camp/village/systems/equipment';
import { settleDailyFood } from '../../src/games/camp/village/systems/food';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
it('reserves longbow source cost, separates completion from handover, and releases cancellation', () => {
  const s = createVillageState(rules, { id: 'orders', classification: 'fixture', worldId: 'orders', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: { wood: 35, stone: 5, rope: 5 } }); initializeEconomy(s, rules);
  const receipt = createOrder(s, { operationId: 'bow', actorId: 'player', kind: 'craft', recipeId: 'WPN005', recipientId: 'a' });
  expect(receipt.accepted).toBe(true); expect(s.reservations[receipt.executionId!]).toEqual({ wood: 14, stone: 4, rope: 5 }); expect(Object.keys(s.economy!.items)).toHaveLength(0);
  s.economy!.fence.level = 2;
  expect(createOrder(s, { operationId: 'fence', actorId: 'a', kind: 'upgradeFence', recipeId: '3', recipientId: 'a' }).accepted).toBe(false);
  expect(cancelExecution(s, receipt.executionId!, 'player', 'cancel').accepted).toBe(true); expect(s.inventory.wood).toBe(35);
  const second = createOrder(s, { operationId: 'bow2', actorId: 'player', kind: 'craft', recipeId: 'WPN005', recipientId: 'a' }); expect(second.accepted).toBe(true);
  s.paused = false; for (let i = 0; i < 700; i++) advanceVillage(s);
  const item = Object.values(s.economy!.items)[0]; expect(item.recipeId).toBe('WPN005'); expect(item.holderId).toBe('player'); expect(s.inventory.wood).toBe(21);
  expect(handoverItem(s, { operationId: 'give', actorId: 'player', recipientId: 'a', itemId: item.id }).accepted).toBe(true); expect(item.ownerId).toBe('a');
});
it('charges the selected daily food mode at most once per person/day', () => {
  const s = createVillageState(rules, { id: 'food', classification: 'fixture', worldId: 'food', seed: 1, actors: [], inventory: { food: 3 } }); initializeEconomy(s, rules);
  settleDailyFood(s, rules, 1); settleDailyFood(s, rules, 1); expect(s.inventory.food).toBe(2);
});
it('does not charge daily maintenance for deceased actors', () => {
  const s = createVillageState(rules, { id: 'dead-food', classification: 'fixture', worldId: 'dead-food', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'dead' }], inventory: { food: 10 } }); initializeEconomy(s, rules);
  s.actors.dead.body.incapacitated = true; s.actors.dead.body.hp = 0;
  settleDailyFood(s, rules, 1); expect(s.inventory.food).toBe(9);
});
