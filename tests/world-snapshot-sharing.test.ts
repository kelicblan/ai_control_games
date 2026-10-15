import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { WorldClient } from '../src/integrations/world/client';

let client: WorldClient | undefined;
afterEach(() => { client?.dispose(); vi.unstubAllGlobals(); });

describe('world snapshot rendering', () => {
  it('reuses unchanged state branches while publishing new simulation values', async () => {
    const state = createGame({ seed: 17, mode: 'rules' }); state.status = 'playing';
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ state, revision: 1, speed: 1, savedAt: 1000, recovered: false, temporaryPause: false, catchingUp: false })));
    client = new WorldClient(() => {}, () => {}); await client.poll();
    const before = client.snapshot.state!;
    state.elapsed += .1; await client.poll();
    const next = client.snapshot.state!;
    expect(next.elapsed).toBe(state.elapsed); expect(next).not.toBe(before);
    expect(next.npcs).toBe(before.npcs); expect(next.world).toBe(before.world);
    expect(next.events).toBe(before.events); expect(next.decisions).toBe(before.decisions);
    expect(before.elapsed).not.toBe(state.elapsed);

    state.npcs[0].position.x += 1; await client.poll();
    const moved = client.snapshot.state!;
    expect(moved.npcs).not.toBe(next.npcs); expect(moved.npcs[0]).not.toBe(next.npcs[0]);
    expect(moved.npcs[1]).toBe(next.npcs[1]);
    expect(JSON.stringify(moved)).toBe(JSON.stringify(state));
  });
});
