import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, getObservation, issueCommand } from '../src/games/camp/simulation/engine';
import { restoreGameState, isValidGameState } from '../src/games/camp/simulation/persistence';
import { getSocialChoices } from '../src/games/camp/simulation/social';
import { ACTIONS, type GameState, type PolicyFunction } from '../src/games/camp/simulation/types';

const idle: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0,
  scores: ACTIONS.map(action => Number(action === 'camp')) });
const fresh = (elapsed: number): GameState => {
  const state:GameState={ ...createGame(), status: 'playing', elapsed, fire: 100,nextWorldEvent: elapsed + .25, weatherUntil: elapsed + 100 };
  state.world!.ecology!.updatedAt=elapsed;return state;
};

describe('continuous survival', () => {
  it('continues past the old deadline with new world events and social invitations', () => {
    const next = advanceGame(fresh(239.75), 2, idle);
    expect(next.elapsed).toBe(241.75);
    expect(next.status).toBe('playing');
    expect(next.events.some(event => event.time >= 240)).toBe(true);
    expect(next.social.threads.some(thread => thread.createdAt >= 240)).toBe(true);
  });

  it('advances the survival day at dawn and cycles observations every ten minutes', () => {
    expect(advanceGame(fresh(599.75), .25, idle).day).toBe(2);
    expect(advanceGame(fresh(1199.75), .25, idle).day).toBe(3);
    const first = fresh(20), later = fresh(620);
    expect(getObservation(first, first.npcs[0]).features[13]).toBe(getObservation(later, later.npcs[0]).features[13]);
  });

  it('offers relative social deadlines after the former final night', () => {
    const opened = issueCommand(fresh(1000), { type: 'social-open', npcId: 'azhuang', topic: 'food' });
    const thread = opened.social.threads.at(-1)!;
    expect(thread.expiresAt).toBeGreaterThan(1000);
    expect(getSocialChoices(opened, thread).find(choice => choice.id === 'promise')?.disabledReason).toBeFalsy();
    const promised = issueCommand(opened, { type: 'social-reply', threadId: thread.id, choiceId: 'promise' });
    expect(promised.social.promises.at(-1)?.dueAt).toBeGreaterThan(1000);
  });

  it('restores long finite saves and migrates ended history into a resumable world', () => {
    const state = fresh(10000);
    state.weatherUntil = 10030;
    expect(isValidGameState(state)).toBe(true);
    expect(restoreGameState(state)).toMatchObject({ elapsed: 10000, day: 17, status: 'playing' });
    expect(restoreGameState({ ...state, status: 'won' })).toMatchObject({ status: 'paused' });
    expect(restoreGameState({ ...state, elapsed: Infinity })).toBeNull();
    expect(restoreGameState({ ...state, weatherUntil: Infinity })).toBeNull();
  });

  it('continues with an extinguished fire and after a death beyond the old deadline', () => {
    expect(advanceGame({ ...fresh(1000), fire: 0, wood: 0 }, .25, idle).status).toBe('playing');
    const dead = fresh(1000); dead.npcs[0].health = 0;
    expect(advanceGame(dead, .25, idle).status).toBe('playing');
  });

  it('keeps long-running monotonic counters saveable without expanding bounded history', () => {
    const state = fresh(10_000_000);
    state.nextEventId = 2_000_000;
    state.nextDecisionId = 2_000_000;
    state.social.nextId = 2_000_000;
    state.social.nextLineId = 2_000_000;
    state.social.revision = 2_000_000;
    state.npcs[0].completedTasks = 2_000_000;
    state.npcs[0].refusals = 2_000_000;
    state.score = 20_000_000;
    expect(isValidGameState(state)).toBe(true);
    expect(isValidGameState({ ...state, nextEventId: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  });
});
