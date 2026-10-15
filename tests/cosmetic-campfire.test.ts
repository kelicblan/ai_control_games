import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, getAllowedActions, getObservation, issueCommand } from '../src/games/camp/simulation/engine';
import { restoreGameState } from '../src/games/camp/simulation/persistence';
import { TERRAIN } from '../src/games/camp/simulation/terrain';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import { ACTIONS, type GameState, type PolicyFunction } from '../src/games/camp/simulation/types';

const idle: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0,
  scores: ACTIONS.map(action => Number(action === 'camp')) });
function fresh(wood = 0): GameState {
  const state = createGame();
  Object.assign(state, { status: 'playing', wood, elapsed: 450, weatherUntil: 1000, nextWorldEvent: 1000 });
  state.world!.ecology!.updatedAt=450;
  return state;
}

describe('cosmetic campfire', () => {
  it.each([0, .5, 3])('reflects wood inventory %s without spending fuel or stopping the world', wood => {
    const state = fresh(wood); state.fire = wood ? 0 : 100;
    const next = advanceGame(state, 2, idle);
    expect(next.status).toBe('playing');
    expect(next.elapsed).toBe(452);
    expect(next.fire).toBe(wood > 0 ? 100 : 0);
    expect(next.wood).toBe(wood);
    expect(next.events.some(event => /立即补充燃料|篝火快暗|无法继续抵挡/.test(event.text))).toBe(false);
  });

  it('does not change health, morale, score or decisions when only the old fire value differs', () => {
    const lit = fresh(3), dark = structuredClone(lit); lit.fire = 100; dark.fire = 0;
    expect(getObservation(dark, dark.npcs[0]).features).toEqual(getObservation(lit, lit.npcs[0]).features);
    expect(advanceGame(dark, 2, idle)).toEqual(advanceGame(lit, 2, idle));
  });

  it('has no fire task, player order or burn hazard', () => {
    const state = fresh(3); state.fire = 20;
    expect(getAllowedActions(state, state.npcs[0])).not.toContain('fire');
    expect(issueCommand(state, { type: 'assign', action: 'fire' }).npcs[0].command).not.toBe('fire');
    expect(TERRAIN.find(object => object.kind === 'fire')?.hazard).toBeUndefined();
  });

  it('has the same night-time health, morale and non-resource score with or without wood', () => {
    const dark = fresh(0), lit = fresh(3);
    for (const state of [dark, lit]) for (const npc of state.npcs) {
      npc.health = 80; npc.action = 'rest'; npc.actionDuration = 100; npc.decisionIn = 100;
      npc.destination = { ...npc.position };
    }
    const a = advanceGame(dark, 1, idle), b = advanceGame(lit, 1, idle);
    expect(a.npcs).toEqual(b.npcs);
    expect(b.score - a.score).toBe(3 * 7); // Only the existing wood resource score differs.
  });

  it('lights up in the same step that gathered wood arrives at storage', () => {
    const state = fresh(0), npc = state.npcs[0];
    npc.inventory.wood = 2; npc.action = 'camp'; npc.actionDuration = .1; npc.decisionIn = 100;
    npc.position = getTaskDestination('camp', npc.id, true); npc.destination = { ...npc.position };
    expect(advanceGame(state, .25, idle)).toMatchObject({ wood: 2, fire: 100, status: 'playing' });
  });

  it('restores an extinguished saved world and cancels obsolete fire work without reviving deaths', () => {
    const state = fresh(0);
    state.status = 'lost'; state.fire = 0;
    state.resultReason = '篝火熄灭了，营地无法继续抵挡寒夜。下次提前准备木材和添柴的人手。';
    state.npcs[0].action = 'fire'; state.npcs[0].command = 'fire';
    const restored = restoreGameState(state)!;
    expect(restored.status).toBe('paused');
    expect(restored.resultReason).toBe('');
    expect(restored.npcs[0].action).toBeNull();
    expect(restored.npcs[0].command).toBeNull();
    state.npcs[0].alive = false; state.npcs[0].health = 0;
    expect(restoreGameState(state)?.status).toBe('paused');
    const dead = fresh(); dead.npcs[0].health = 0;
    expect(advanceGame(dead, .25, idle).status).toBe('playing');
  });
});
