import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { projectDeliveries } from '../../scripts/world/village-playable-ui';
it('shows a manual delivery failure and replaces stale failure text after a successful retry', () => {
  const rules = selectWorldRules('village-v1', 'p4-social-content-v1'), s = createVillageState(rules, { id: 'ui-delivery', classification: 'fixture', worldId: 'ui-delivery', seed: 1, inventory: {}, actors: [{ archetypeId: 'W001', instanceId: 'target' }] }); initializeEconomy(s, rules);
  s.economy!.items.item = { id: 'item', recipeId: 'WPN003', ownerId: 'player', holderId: 'player', equippedBy: null, orderId: 'bow' };
  const task: typeof s.executions[string] = { id: 'give', command: { operationId: 'give', action: 'DELIVER_ITEM', actorId: 'player', targetId: 'target', parameters: { itemId: 'item' }, source: 'player_input', readSet: {} }, status: 'failed', reason: '接收人无法领取', acceptedAt: 0, duration: 1, remaining: 0, reservation: {}, eventIds: [] };
  s.executions.give = task;
  expect(projectDeliveries(s)[0]).toMatchObject({ itemId: 'item', state: 'failed', reason: '接收人无法领取' });
  s.executions.retry = { ...task, id: 'retry', status: 'completed' }; delete s.executions.retry.reason; s.economy!.items.item.holderId = 'target';
  expect(projectDeliveries(s)[0]).toMatchObject({ itemId: 'item', state: 'delivered', reason: null });
});
