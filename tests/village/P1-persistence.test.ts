import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VillageRuntime } from '../../scripts/world/village-runtime';
it('persists execution receipts, isolates owners and rejects stale writes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'village-p1-')), file = path.join(dir, 'world.sqlite');
  let runtime = new VillageRuntime(file);
  try {
    const initial = runtime.create('owner-a', { id: 'runtime', worldId: 'new-world', classification: 'experiment', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: { wood: 5 } });
    expect(runtime.read('owner-b')).toBeNull();
    expect(initial.actors.a).not.toHaveProperty('personal');
    const command = { operationId: 'wait-one', actorId: 'player', action: 'WAIT', parameters: { seconds: .5 }, source: 'player_input' as const, readSet: { 'actor:player': 0 } };
    const receipt = runtime.command('owner-a', 0, command);
    runtime.close(); runtime = new VillageRuntime(file);
    expect(runtime.command('owner-a', 0, command)).toEqual(receipt);
    expect(() => runtime.command('owner-a', 0, { ...command, operationId: 'new-op' })).toThrow(/revision/i);
    expect(() => runtime.command('owner-a', 1, { ...command, actorId: 'a' })).toThrow(/player/i);
    runtime.setPaused('owner-a', 1, false);
    for (let i = 0; i < 5; i++) runtime.tick();
    expect(runtime.read('owner-a')?.executions[receipt.executionId!].status).toBe('completed');
  } finally { runtime.close(); rmSync(dir, { recursive: true, force: true }); }
});
