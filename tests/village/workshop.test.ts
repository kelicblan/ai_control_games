import { expect, it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeWorkshop, WORKSHOP_RULES } from '../../src/games/camp/village/systems/workshop';
import { submitCommand, cancelExecution } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
function world() { const s = createVillageState(rules, { id: 'workshop', classification: 'fixture', worldId: 'workshop', seed: 1, inventory: { wood: 100, stone: 50, rope: 30, food: 100 }, actors: [] }); initializeEconomy(s, rules); return s; }
function command(s: ReturnType<typeof world>, action: string, operationId: string) { return submitCommand(s, { actorId: 'player', action, operationId, parameters: action === 'CRAFT' ? { recipeId: 'WPN003', recipientId: 'player' } : {}, readSet: {}, source: 'player_input' }); }
function finish(s: ReturnType<typeof world>, seconds = 90) { s.paused = false; for (let i = 0; i < seconds * 10; i++) advanceVillage(s); }
it('rejects an inaccessible construction site without reserving materials', () => {
  const s = world(); initializeWorkshop(s); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 5 });
  expect(command(s, 'BUILD_WORKSHOP', 'blocked').accepted).toBe(false); expect(s.reservations).toEqual({}); expect(s.inventory.wood).toBe(100);
});
it('requires real construction, reserves once, releases cancellation, travels and produces at the workshop', () => {
  const s = world(); initializeWorkshop(s);
  expect(command(s, 'CRAFT', 'unbuilt').accepted).toBe(false);
  const build = command(s, 'BUILD_WORKSHOP', 'build'); expect(build.accepted).toBe(true);
  expect(s.reservations[build.executionId!]).toEqual(WORKSHOP_RULES.cost);
  expect(command(s, 'BUILD_WORKSHOP', 'duplicate').accepted).toBe(false);
  expect(cancelExecution(s, build.executionId!, 'player', 'cancel').accepted).toBe(true);
  expect(s.inventory.wood).toBe(100);
  expect(command(s, 'BUILD_WORKSHOP', 'build-again').accepted).toBe(true); finish(s);
  expect(s.economy!.workshop!.completedEventId).toBeTruthy();
  expect(s.inventory.wood).toBe(100 - WORKSHOP_RULES.cost.wood);
  expect(command(s, 'BUILD_WORKSHOP', 'already-built').accepted).toBe(false);
  s.actors.player.position = { x: 0, y: 0 };
  expect(command(s, 'CRAFT', 'bow').accepted).toBe(true); finish(s);
  expect(Object.values(s.economy!.items)).toHaveLength(1);
  expect(Math.hypot(s.actors.player.position.x - s.economy!.workshop!.position.x, s.actors.player.position.y - s.economy!.workshop!.position.y)).toBeLessThanOrEqual(1.5);
  expect(restoreVillageState(JSON.parse(JSON.stringify(s)), rules)).toEqual(s);
});
it('preserves accepted old crafting jobs and inventory when enabling workshop rules once', () => {
  const s = world(), before = { ...s.inventory }; const old = command(s, 'CRAFT', 'old-bow'); expect(old.accepted).toBe(true);
  initializeWorkshop(s, true); initializeWorkshop(s, true);
  expect(s.inventory).toEqual(before); expect(s.economy!.workshop!.legacyExecutions).toEqual([old.executionId]);
  finish(s); expect(s.executions[old.executionId!].status).toBe('completed');
  expect(Object.keys(s.economy!.items)).toHaveLength(1); expect(s.economy!.workshop!.completedEventId).toBeNull();
});
