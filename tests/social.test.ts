import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/game/engine';
import { getSocialChoices } from '../src/game/social';
import { ACTIONS, type GameState, type PolicyFunction } from '../src/game/types';

const campPolicy: PolicyFunction = () => ({ action: 'camp', emotion: 'calm',
  scores: ACTIONS.map(action => Number(action === 'camp')), source: 'model', latencyMs: 0 });

describe('five-person social camp', () => {
  it('starts five distinct healthy companions and an empty, bounded social history', () => {
    const state = createGame({ seed: 52 });
    expect(state.npcs.map(npc => npc.id)).toEqual(['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye']);
    for (const npc of state.npcs) {
      expect([npc.energy, npc.hunger, npc.morale, npc.trust, npc.fear].every(Number.isFinite)).toBe(true);
    }
    expect(state).toHaveProperty('social.version', 1);
    expect(state).toHaveProperty('social.threads', []);
  });

  it('lets a paused leader talk and spend a real meal once', () => {
    const initial: GameState = { ...createGame(), status: 'paused', food: 1 };
    initial.npcs[0].hunger = 80;
    const opened = issueCommand(initial, { type: 'social-open', npcId: 'azhuang', topic: 'food' });
    const thread = opened.social.threads.at(-1)!;
    expect(thread).toBeDefined();
    expect(getSocialChoices(opened, thread)).toHaveLength(3);
    const reply = { type: 'social-reply' as const, threadId: thread.id, choiceId: 'feed' };
    const fed = issueCommand(opened, reply);
    expect(fed.food).toBe(0);
    expect(fed.npcs[0].hunger).toBe(36);
    expect(fed.elapsed).toBe(0);
    expect(issueCommand(fed, reply)).toEqual(fed);
  });

  it('executes an agreed rest as an explicit rule without inventing a model decision', () => {
    let state: GameState = { ...createGame(), status: 'paused' };
    state.npcs[0].energy = 35;
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
    const thread = state.social.threads.at(-1)!;
    expect(thread?.kind).toBe('rest');
    state = issueCommand(state, { type: 'social-reply', threadId: thread.id, choiceId: 'rest' });
    expect(state.npcs[0].action).toBeNull();
    state = advanceGame({ ...state, status: 'playing' }, .25, campPolicy);
    expect(state.npcs[0].action).toBe('rest');
    expect(state.decisions.find(decision => decision.npcId === 'azhuang')).toMatchObject({
      action: 'rest', source: 'rules', trigger: 'social',
    });
    expect(state.decisions.some(decision => decision.npcId !== 'azhuang' && decision.source === 'model')).toBe(true);
  });

  it('initiates a real request while autonomous work continues', () => {
    const state = advanceGame({ ...createGame(), status: 'playing' }, 9, campPolicy);
    expect(state.social.stats.initiated).toBe(1);
    expect(state.social.threads.filter(thread => thread.status === 'open')).toHaveLength(1);
    expect(state.npcs.every(npc => npc.action !== null || npc.completedTasks > 0)).toBe(true);
  });

  it('does not duplicate the opening invitation after the player already contacted its speaker', () => {
    const paused: GameState = { ...createGame(), status: 'paused' };
    const opened = issueCommand(paused, { type: 'social-open', npcId: 'linlan', topic: 'work' });
    const next = advanceGame({ ...opened, status: 'playing' }, 9, campPolicy);
    expect(next.social.threads.filter(thread => thread.status === 'open' && thread.initiator === 'linlan')).toHaveLength(1);
  });

  it('recalls an unfinished timed exploration even when the ordinary policy would keep exploring', () => {
    let state: GameState = { ...createGame(), status: 'paused' };
    state = issueCommand(state, { type: 'social-open', npcId: 'aye', topic: 'checkin' });
    state = issueCommand(state, { type: 'social-reply', threadId: state.social.threads.at(-1)!.id, choiceId: 'explore' });
    state = advanceGame({ ...state, status: 'playing' }, .25, campPolicy);
    expect(state.npcs[4].action).toBe('explore');
    state.social.agreements[0].until = state.elapsed;
    const exploring: PolicyFunction = observation => ({ ...campPolicy(observation), action: 'explore',
      scores: ACTIONS.map(action => Number(action === 'explore')) });
    const recalled = advanceGame(state, .25, exploring);
    expect(recalled.npcs[4].action).toBe('camp');
    expect(recalled.decisions.filter(item => item.npcId === 'aye').at(-1)).toMatchObject({ action: 'camp', source: 'rules' });
  });

  it('rechecks an ongoing agreement after health worsens and gives survival needs priority', () => {
    let state: GameState = { ...createGame(), status: 'paused' };
    state = issueCommand(state, { type: 'social-open', npcId: 'aye', topic: 'checkin' });
    state = issueCommand(state, { type: 'social-reply', threadId: state.social.threads.at(-1)!.id, choiceId: 'explore' });
    state = advanceGame({ ...state, status: 'playing' }, .25, campPolicy);
    state.npcs[4].health = 20;
    const restPolicy: PolicyFunction = observation => ({ ...campPolicy(observation), action: 'rest',
      scores: ACTIONS.map(action => Number(action === 'rest')) });
    const rested = advanceGame(state, .25, restPolicy);
    expect(rested.npcs[4].action).toBe('rest');
    expect(rested.social.agreements.some(item => item.npcId === 'aye')).toBe(false);
  });

  it('does not complete a specific help agreement by substituting a different patient', () => {
    let state: GameState = { ...createGame(), status: 'paused' };
    state.npcs[1].health = 62; state.npcs[4].health = 64;
    state = issueCommand(state, { type: 'social-open', npcId: 'laozhou', topic: 'checkin' });
    state = issueCommand(state, { type: 'social-reply', threadId: state.social.threads.at(-1)!.id, choiceId: 'help' });
    const agreement = state.social.agreements.find(item => item.npcId === 'laozhou')!;
    expect(agreement.targetId).toBe('xiaomi');
    state = issueCommand(state, { type: 'feed', npcId: 'xiaomi' });
    state = advanceGame({ ...state, status: 'playing' }, .25, campPolicy);
    expect(state.social.agreements.some(item => item.id === agreement.id)).toBe(false);
    expect(state.npcs[2].action).toBe('camp');
    expect(state.stats.helps).toBe(0);
    expect(state.social.memories.some(item => item.threadId === agreement.threadId && item.text.includes('实际完成了与你商定'))).toBe(false);
  });

  it('uses the vacated work slot for a fresh replacement and preserves another worker’s progress', () => {
    let state: GameState = { ...createGame(), status: 'paused' };
    state.npcs[0].action = 'wood'; state.npcs[0].progress = .8;
    state.npcs[1].action = 'wood'; state.npcs[1].progress = .9;
    state.social.people.azhuang.workload = 40;
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
    state = issueCommand(state, { type: 'social-reply', threadId: state.social.threads.at(-1)!.id, choiceId: 'swap' });
    expect(state.social.agreements.some(item => item.action === 'wood' && item.npcId !== 'xiaomi' && item.npcId !== 'azhuang')).toBe(true);
    expect(state.npcs[1].action).toBe('wood');
    expect(state.npcs[1].progress).toBe(.9);
  });
});
