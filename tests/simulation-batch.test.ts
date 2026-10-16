import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceGame, advanceGameSteps, createGame } from '../src/games/camp/simulation/engine';
import { baselinePolicy } from '../src/games/camp/ai/policy';

describe('fixed-step catch-up batches', () => {
  // Inference wall-clock telemetry is intentionally outside deterministic game state.
  beforeEach(() => { vi.spyOn(performance, 'now').mockReturnValue(0); });
  afterEach(() => { vi.restoreAllMocks(); });
  it.each([1, 50, 200])('preserves every deterministic transition across %s steps', steps => {
    const initial = createGame({ seed: 17, mode: 'rules' });
    initial.status = 'playing';
    const original = structuredClone(initial);
    let expected = initial;
    for (let index = 0; index < steps; index++) expected = advanceGame(expected, .1, baselinePolicy);
    expect(advanceGameSteps(initial, steps, baselinePolicy)).toEqual(expected);
    expect(initial).toEqual(original);
  });

  it('continues an empty world and preserves paused states', () => {
    const initial = createGame({ seed: 17, mode: 'rules' });
    initial.status = 'playing';
    for (const npc of initial.npcs) { npc.alive = false; npc.health = 0; }
    let expected = initial;
    for (let index = 0; index < 50; index++) expected = advanceGame(expected, .1, baselinePolicy);
    expect(advanceGameSteps(initial, 50, baselinePolicy)).toEqual(expected);
    initial.status = 'paused';
    expect(advanceGameSteps(initial, 50, baselinePolicy)).toEqual(initial);
  });
});
