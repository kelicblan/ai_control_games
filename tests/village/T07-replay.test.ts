import { expect, it } from 'vitest';
import { simulateVillage, replayVillage } from '../../src/games/camp/village/simulation';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
const rules = selectWorldRules('village-v1', 'draft-table-v1');
it('pairs a decision with its own execution, marks horizon truncation, and replays exactly', () => {
  const scenario = { id: 'replay', classification: 'fixture' as const, worldId: 'r', seed: 12, inventory: {}, actors: [{ archetypeId: 'W001', instanceId: 'a' }] };
  const run = simulateVillage(rules, scenario, 7, [{ tick: 0, command: { operationId: 'one', actorId: 'a', action: 'WAIT', parameters: { seconds: .5 }, readSet: { 'actor:a': 0 }, source: 'scripted_test' as const } },
    { tick: 6, command: { operationId: 'two', actorId: 'a', action: 'WAIT', parameters: { seconds: 1 }, readSet: { 'actor:a': 2 }, source: 'scripted_test' as const } }]);
  expect(run.groups[0].status).toBe('completed'); expect(run.groups[1].status).toBe('truncated');
  expect(run.groups[0].executionId).not.toBe(run.groups[1].executionId);
  expect(replayVillage(rules, run).finalHash).toBe(run.finalHash);
  const changed = structuredClone(run); changed.finalHash = '0'.repeat(64);
  expect(() => replayVillage(rules, changed)).toThrow(/replay/i);
});
