import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
let Runtime: typeof import('../../scripts/world/village-runtime').VillageRuntime;
beforeAll(async () => { vi.stubEnv('CAMP_WORLD_LAYOUT', 'new-world-v1'); vi.resetModules(); Runtime = (await import('../../scripts/world/village-runtime')).VillageRuntime; });
afterAll(() => vi.unstubAllEnvs());
it('persists a real shared-map workshop, goals, inventory and accepted work across SQLite reopen', () => {
  const database = path.join(mkdtempSync(path.join(tmpdir(), 'campmind-playable-')), 'world.sqlite'); let runtime = new Runtime(database, Date.now, false);
  try {
    const initial = runtime.create('owner', { id: 'shared-workshop', classification: 'experiment', worldId: 'shared-workshop', ruleVersion: 'p4-social-content-v1', seed: 1701, navigationMode: 'shared-world', storePosition: { x: 50, y: 39 }, inventory: { food: 100, wood: 80, stone: 40, rope: 30 }, actors: [] });
    expect(initial.uiCatalog.workshop?.state).toBe('planned');
    const receipt = runtime.command('owner', initial.revision, { operationId: 'build', actorId: 'player', issuedAtTick: initial.tick, action: 'BUILD_WORKSHOP', parameters: {}, readSet: {}, source: 'player_input' }, initial.worldId); expect(receipt.accepted).toBe(true);
    const accepted = runtime.read('owner')!; runtime.close(); runtime = new Runtime(database, Date.now, false);
    const resumed = runtime.read('owner')!; expect(resumed.inventory).toEqual(accepted.inventory); expect(resumed.reservations).toEqual(accepted.reservations); expect(resumed.economy!.journey).toEqual(accepted.economy!.journey);
    runtime.setPaused('owner', resumed.revision, false, resumed.worldId);
    for (let i = 0; i < 400; i++) { runtime.tick(); if (i % 25 === 24 && runtime.read('owner')!.uiCatalog.workshop?.state === 'ready') break; }
    const built = runtime.read('owner')!; expect(built.uiCatalog.workshop?.state).toBe('ready'); expect(built.economy!.journey!.completed.workshop).toBeTruthy();
    runtime.setPaused('owner', built.revision, true, built.worldId); const paused = runtime.read('owner')!;
    runtime.close(); runtime = new Runtime(database, Date.now, false);
    const final = runtime.read('owner')!; expect(final.economy!.workshop).toEqual(paused.economy!.workshop); expect(final.inventory).toEqual(paused.inventory); expect(final.paused).toBe(true); expect(final.actors.player.growth.experience).toBe(2);
  } finally { runtime.close(); }
}, 60000);
