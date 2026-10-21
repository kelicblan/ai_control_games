import { expect, it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
function setup() {
  const s = createVillageState(rules, { id: 'delivery', classification: 'fixture', worldId: 'delivery', seed: 1, inventory: { wood: 100, stone: 20, rope: 20, food: 100 }, actors: [{ archetypeId: 'W001', instanceId: 'hunter', initial: { position: { x: 8, y: 0 } } }] }); initializeEconomy(s, rules); s.paused = false; return s;
}
function send(s: ReturnType<typeof setup>, action: string, operationId: string, parameters: Record<string, string | boolean> = {}, targetId?: string) { return submitCommand(s, { action, actorId: 'player', operationId, parameters, ...(targetId ? { targetId } : {}), source: 'player_input', readSet: {} }); }
function ticks(s: ReturnType<typeof setup>, count = 500) { for (let i = 0; i < count; i++) advanceVillage(s); }
it('fulfills an explicit recipient through physical delivery, keeps crafting and equipping distinct', () => {
  const s = setup(); expect(send(s, 'CRAFT', 'bow', { recipeId: 'WPN003', recipientId: 'hunter', deliver: true }).accepted).toBe(true); ticks(s);
  const item = Object.values(s.economy!.items)[0];
  expect(item).toMatchObject({ ownerId: 'hunter', holderId: 'hunter', equippedBy: null });
  expect(s.events.some(e => e.kind === 'item.handed_over' && e.facts.itemId === item.id)).toBe(true);
  expect(Math.hypot(s.actors.player.position.x - 8, s.actors.player.position.y)).toBeLessThanOrEqual(2);
  const transferCount = s.events.filter(e => e.kind === 'item.handed_over').length; ticks(s); expect(s.events.filter(e => e.kind === 'item.handed_over')).toHaveLength(transferCount);
  expect(restoreVillageState(JSON.parse(JSON.stringify(s)), rules)).toEqual(s);
});
it('does not teleport or transfer to a disabled recipient and permits a fresh explicit retry', () => {
  const s = setup(); send(s, 'CRAFT', 'bow', { recipeId: 'WPN003', recipientId: 'player' }); ticks(s);
  const item = Object.values(s.economy!.items)[0];
  const delivery = send(s, 'DELIVER_ITEM', 'give', { itemId: item.id }, 'hunter'); expect(delivery.accepted).toBe(true);
  expect(s.economy!.items[item.id].holderId).toBe('player');
  s.actors.hunter.body.downed = true; ticks(s, 100);
  expect(s.executions[delivery.executionId!].status).toBe('failed'); expect(s.economy!.items[item.id].holderId).toBe('player');
  s.actors.hunter.body.downed = false;
  expect(send(s, 'DELIVER_ITEM', 'retry', { itemId: item.id }, 'hunter').accepted).toBe(true); ticks(s, 100);
  expect(s.economy!.items[item.id].holderId).toBe('hunter');
  expect(send(s, 'DELIVER_ITEM', 'steal', { itemId: item.id }, 'hunter').accepted).toBe(false);
});
it('retains the item when a moving recipient leaves the bounded delivery journey', () => {
  const s = setup(); send(s, 'CRAFT', 'bow', { recipeId: 'WPN003', recipientId: 'player' }); ticks(s);
  const item = Object.values(s.economy!.items)[0]; const r = send(s, 'DELIVER_ITEM', 'moving', { itemId: item.id }, 'hunter'); expect(r.accepted).toBe(true);
  s.actors.hunter.position = { x: 80, y: 0 }; ticks(s, 100);
  expect(s.executions[r.executionId!].status).toBe('failed'); expect(s.economy!.items[item.id].ownerId).toBe('player');
});
