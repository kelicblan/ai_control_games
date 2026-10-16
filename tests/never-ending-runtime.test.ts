import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorldRuntime } from '../scripts/world/runtime';
import { SnapshotStore } from '../scripts/world/store';
import { createGame } from '../src/games/camp/simulation/engine';
import { ACTIONS, type PolicyFunction } from '../src/games/camp/simulation/types';

const idle: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0,
  scores: ACTIONS.map(action => Number(action === 'camp')) });

describe('non-terminal SQLite worlds', () => {
  it.each(['won', 'lost'] as const)('resumes and checkpoints an old %s world with no survivors after cancelling its stale pause lease', status => {
    const directory = mkdtempSync(path.join(tmpdir(), 'camp-never-ending-'));
    const file = path.join(directory, 'world.sqlite');
    let runtime: WorldRuntime | undefined, store: SnapshotStore | undefined;
    let now = 1_000_000;
    try {
      const state = createGame({ seed: 17 });
      state.status = status; state.elapsed = 1200;
      delete state.world!.ecology;
      for (const npc of state.npcs) { npc.alive = false; npc.health = 0; }
      store = new SnapshotStore(file);
      store.save('p', { version: 1, state, revision: 1, speed: 1, at: 1000, pauseUntil: 2000, pauseOwner: 'old-tab' });
      store.close();
      runtime = new WorldRuntime(file, idle, () => now);
      const restored = runtime.read('p');
      expect(restored).toMatchObject({ state: { status: 'paused', elapsed: 1200 }, catchingUp: false, temporaryPause: false });
      runtime.mutate('p', 1, 'resume', { type: 'pause', paused: false }, 'tab');
      now += 1200; runtime.tick();
      expect(runtime.read('p').state).toMatchObject({ status: 'playing', elapsed: 1201.2 });
      runtime.close();
      runtime = new WorldRuntime(file, idle, () => now);
      expect(runtime.read('p').state).toMatchObject({ status: 'playing', elapsed: 1201.2 });
    } finally { runtime?.close(); store?.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
