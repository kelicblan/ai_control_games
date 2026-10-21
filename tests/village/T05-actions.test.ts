import { describe, expect, it } from 'vitest';
import { ensure } from '../../packages/action-runtime/src/json';
import type { ActionCapability } from '../../packages/action-runtime/src/runtime';
import type { ActionCommand } from '../../packages/action-runtime/src/types';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { villageActions, freeResources, WAIT_CAPABILITY } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import type { VillageState } from '../../src/games/camp/village/domain/types';
const rules = selectWorldRules('village-v1', 'draft-table-v1');
const world = () => createVillageState(rules, { id: 'fixture', classification: 'fixture', worldId: 'w', seed: 1, inventory: { wood: 35 }, actors: [{ archetypeId: 'W001', instanceId: 'a' }, { archetypeId: 'W001', instanceId: 'b' }] });
const work: ActionCapability<VillageState> = { id: 'FIXTURE_WORK', validate(_s, c) { ensure(typeof c.parameters.cost === 'number', 'Bad fixture cost'); return { duration: .2, cost: { wood: c.parameters.cost } }; }, complete(s, e) { s.actors[e.command.actorId].carried.wood = (s.actors[e.command.actorId].carried.wood ?? 0) + 1; } };
const command = (id: string, actor = 'a', cost = 20): ActionCommand => ({ operationId: id, actorId: actor, action: 'FIXTURE_WORK', parameters: { cost }, readSet: {}, source: 'scripted_test' });
describe('T05 single action runtime and resource transactions', () => {
  it('separates accepted from completed and charges a duplicate operation exactly once', () => {
    const state = world(), runtime = villageActions([work]); state.paused = false;
    const receipt = runtime.submit(state, command('op1')); expect(receipt.accepted).toBe(true);
    expect(state.inventory.wood).toBe(35); expect(freeResources(state, 'wood')).toBe(15);
    expect(state.executions[receipt.executionId!].status).toBe('accepted');
    expect(runtime.submit(state, command('op1'))).toEqual(receipt);
    advanceVillage(state, .1, runtime.advance); expect(state.inventory.wood).toBe(35);
    advanceVillage(state, .1, runtime.advance); expect(state.inventory.wood).toBe(15);
    expect(state.actors.a.carried.wood).toBe(1); expect(state.executions[receipt.executionId!].status).toBe('completed');
    expect(runtime.submit(state, command('op1'))).toEqual(receipt); expect(state.inventory.wood).toBe(15);
    expect(restoreVillageState(JSON.parse(JSON.stringify(state)), rules)).toEqual(state);
    expect(() => runtime.submit(state, command('op1', 'a', 1))).toThrow(/Operation/);
  });
  it('does not oversell and cancellation releases only its own reservation', () => {
    const state = world(), runtime = villageActions([work]);
    const a = runtime.submit(state, command('a', 'a', 20)), b = runtime.submit(state, command('b', 'b', 10));
    expect(freeResources(state, 'wood')).toBe(5);
    expect(runtime.cancel(state, a.executionId!, 'b', 'wrong-owner').accepted).toBe(false);
    expect(runtime.cancel(state, a.executionId!, 'a', 'cancel-a').accepted).toBe(true);
    expect(state.reservations[b.executionId!]).toEqual({ wood: 10 }); expect(freeResources(state, 'wood')).toBe(25);
    expect(runtime.submit(state, command('too-much', 'player', 30)).accepted).toBe(false);
    expect(state.inventory.wood).toBe(35);
  });
  it('ignores unrelated versions but rejects stale related reads and unsupported actions', () => {
    const state = world(), runtime = villageActions([WAIT_CAPABILITY]);
    state.versions.unrelated = 30;
    const c: ActionCommand = { operationId: 'wait', actorId: 'a', action: 'WAIT', parameters: { seconds: .2 }, readSet: { 'actor:a': 0 }, source: 'fallback' };
    expect(runtime.submit(state, c).accepted).toBe(true);
    expect(runtime.submit(state, { ...c, operationId: 'stale', actorId: 'b', readSet: { 'actor:a': 0 } }).accepted).toBe(false);
    expect(runtime.submit(state, { ...c, operationId: 'sql', action: 'SQL', actorId: 'b', readSet: {} }).accepted).toBe(false);
  });
  it('rolls back failed effects and safely interrupts a newly incapacitated actor', () => {
    const state = world(); state.paused = false;
    const bad = { ...work, complete(s: VillageState) { s.inventory.wood = 999; throw new Error('Fixture failure'); } };
    const runtime = villageActions([bad]);
    const first = runtime.submit(state, command('failure', 'a', 10));
    advanceVillage(state, .1, runtime.advance); advanceVillage(state, .1, runtime.advance);
    expect(state.inventory.wood).toBe(35); expect(state.executions[first.executionId!].status).toBe('failed'); expect(state.reservations).toEqual({});
    const second = runtime.submit(state, command('downed', 'b', 10)); state.actors.b.body.downed = true;
    advanceVillage(state, .1, runtime.advance);
    expect(state.executions[second.executionId!].status).toBe('interrupted'); expect(state.inventory.wood).toBe(35);
  });
  it('rolls back finite but invalid negative resource effects', () => {
    const state = world(); state.paused = false;
    const runtime = villageActions([{ ...work, complete(s) { s.inventory.wood = -1; } }]);
    const receipt = runtime.submit(state, command('negative', 'a', 10));
    advanceVillage(state, .1, runtime.advance); advanceVillage(state, .1, runtime.advance);
    expect(state.inventory.wood).toBe(35); expect(state.executions[receipt.executionId!].status).toBe('failed');
  });
});
