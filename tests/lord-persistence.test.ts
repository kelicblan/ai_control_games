import { describe, expect, it } from 'vitest';
import { createGame, advanceGame, issueCommand } from '../src/games/camp/simulation/engine';
import { restoreGameState } from '../src/games/camp/simulation/persistence';
import { baselinePolicy } from '../src/games/camp/ai/policy';

describe('lord game integration', () => {
  it('creates a separate player and moves only through simulation', () => {
    const initial = { ...createGame(), status: 'playing' as const };
    expect(initial.lord?.playerId).toBe('local-player');
    const directed = issueCommand(initial, { type: 'lord-input', direction: { x: 0, y: 1 } });
    expect(directed.lord!.position).toEqual(initial.lord!.position);
    const advanced = advanceGame(directed, .25, baselinePolicy);
    expect(advanced.lord!.position.y).toBeGreaterThan(initial.lord!.position.y);
    expect(advanced.npcs).toHaveLength(9);
  });
  it('migrates absent lord and never replays held controls on restore', () => {
    const old = createGame(); delete old.lord;
    const migrated = restoreGameState(old);
    expect(migrated?.lord?.name).toBe('领主');
    migrated!.lord!.input = { x: 1, y: 0 };
    expect(restoreGameState(migrated)?.lord?.input).toEqual({ x: 0, y: 0 });
  });
  it('rejects malformed player identity and nonfinite position', () => {
    const state = createGame();
    expect(state.lord).toBeDefined();
    state.lord!.position.x = Infinity;
    expect(restoreGameState(state)).toBeNull();
    const foreign = createGame(); (foreign.lord as unknown as { playerId: string }).playerId = 'other';
    expect(restoreGameState(foreign)).toBeNull();
  });
});
