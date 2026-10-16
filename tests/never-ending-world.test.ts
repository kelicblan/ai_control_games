import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { restoreGameState, isValidGameState } from '../src/games/camp/simulation/persistence';
import { ACTIONS, type PolicyFunction } from '../src/games/camp/simulation/types';

const idle: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0,
  scores: ACTIONS.map(action => Number(action === 'camp')) });
const fresh = () => ({ ...createGame({ seed: 17 }), status: 'playing' as const });

describe('world never ends automatically', () => {
  it('records a death once while survivors and world time keep advancing', () => {
    const state = fresh(); state.npcs[3].health = 0;
    const next = advanceGame(state, 2, idle);
    expect(next).toMatchObject({ status: 'playing', elapsed: 2, resultReason: '' });
    expect(next.npcs[3]).toMatchObject({ alive: false, health: 0, action: null, command: null });
    expect(next.npcs[0].hunger).toBeGreaterThan(state.npcs[0].hunger);
    const deaths = next.events.filter(event => event.npcId === 'linlan' && event.kind === 'danger');
    expect(deaths).toHaveLength(1);
    expect(advanceGame(next, 2, idle).events.filter(event => event.npcId === 'linlan' && event.kind === 'danger')).toHaveLength(1);
  });

  it('continues days, world events and lord movement even when everybody is dead', () => {
    const state = fresh(); state.elapsed = 599.8; state.nextWorldEvent = 600;
    for (const npc of state.npcs) npc.health = 0;
    const before = state.lord!.position;
    const controlled = issueCommand(state, { type: 'lord-input', direction: { x: 1, y: 0 } });
    const next = advanceGame(controlled, 1, idle);
    expect(next).toMatchObject({ status: 'playing', elapsed: 600.8, day: 2 });
    expect(next.npcs.every(npc => !npc.alive && npc.health === 0)).toBe(true);
    expect(next.events.some(event => event.time >= 600)).toBe(true);
    expect(next.lord!.position).not.toEqual(before);
    expect(isValidGameState(next)).toBe(true);
  });

  it.each(['won', 'lost'] as const)('migrates an old %s world without resurrecting anyone or resetting progress', status => {
    const state = { ...fresh(), status, elapsed: 900, resultReason: '旧版结束记录' };
    delete state.world!.ecology;
    state.npcs[3].alive = false; state.npcs[3].health = 0;
    const restored = restoreGameState(state)!;
    expect(restored).toMatchObject({ status: 'paused', elapsed: 900, resultReason: '' });
    expect(restored.npcs[3]).toMatchObject({ alive: false, health: 0 });
    expect(restored.social).toEqual(state.social);
    expect(advanceGame({ ...restored, status: 'playing' }, .25, idle)).toMatchObject({ status: 'playing', elapsed: 900.25 });
  });

  it('keeps living companions promises and conversations when another companion dies', () => {
    let state = fresh(); state.npcs[0].hunger = 73;
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'food' }) as typeof state;
    const thread = state.social.threads.at(-1)!;
    state = issueCommand(state, { type: 'social-reply', threadId: thread.id, choiceId: 'promise' }) as typeof state;
    state.npcs[3].health = 0;
    const next = advanceGame(state, .25, idle);
    expect(next.status).toBe('playing');
    expect(next.social.promises[0].status).toBe('pending');
  });
});
