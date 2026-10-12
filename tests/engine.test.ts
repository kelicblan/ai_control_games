import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, getAllowedActions, getObservation, issueCommand } from '../src/game/engine';
import { ACTIONS, type ActionId, type GameState, type PolicyFunction } from '../src/game/types';

const choose = (action: ActionId): PolicyFunction => () => ({
  action, emotion: 'calm', scores: ACTIONS.map((item) => item === action ? 1 : 0),
  source: 'rules', latencyMs: 0,
});

const survivalPolicy: PolicyFunction = (observation) => {
  const f = observation.features;
  const available = (action: ActionId) => observation.allowed.includes(action);
  let action: ActionId = 'camp';
  if (f[11] < .50 && available('fire')) action = 'fire';
  else if (f[0] > .58 && available('eat')) action = 'eat';
  else if (f[2] < .65 || f[1] < .25) action = 'rest';
  else if (f[17] < .50 && available('help')) action = 'help';
  else if (f[13] > .85) action = 'camp';
  else if (f[9] < .34 && available('wood')) action = 'wood';
  else if (f[10] < .40 && available('food')) action = 'food';
  else if (f[1] < .8) action = 'rest';
  return { action, emotion: 'calm', scores: ACTIONS.map((item) => item === action ? 1 : 0), source: 'rules', latencyMs: 0 };
};

function play(state: GameState, policy: PolicyFunction, seconds = 240) {
  let result = { ...state, status: 'playing' as const } as GameState;
  for (let i = 0; i < seconds * 4 && result.status === 'playing'; i++) result = advanceGame(result, .25, policy);
  return result;
}

describe('survival simulation', () => {
  it('starts ready and does not consume time or resources while ready or paused', () => {
    const ready = createGame({ seed: 23 });
    expect(ready.status).toBe('ready');
    expect(advanceGame(ready, 10, choose('wood'))).toEqual(ready);
    const paused = { ...ready, status: 'paused' as const };
    expect(advanceGame(paused, 10, choose('wood'))).toEqual(paused);
    expect(advanceGame({ ...ready, status: 'playing' }, Number.NaN, choose('wood'))).toEqual({ ...ready, status: 'playing' });
  });

  it('keeps paused task assignments pending until the resumed policy chooses an action', () => {
    const paused: GameState = { ...createGame({ seed: 23 }), status: 'paused' };
    const assigned = issueCommand(paused, { type: 'assign', npcId: 'azhuang', action: 'wood' });
    expect(assigned.npcs[0].command).toBe('wood');
    expect(assigned.npcs[0].action).toBeNull();
    expect(assigned.npcs[0].position).toEqual(paused.npcs[0].position);
    let policyCalls = 0;
    const policy: PolicyFunction = (observation) => {
      policyCalls++;
      return choose(observation.features[23] === 1 ? 'wood' : 'rest')(observation);
    };
    expect(advanceGame(assigned, 30, policy)).toEqual(assigned);
    expect(policyCalls).toBe(0);
    const resumed = advanceGame({ ...assigned, status: 'playing' }, .25, policy);
    expect(resumed.npcs[0].action).toBe('wood');
    expect(resumed.decisions[0].accepted).toBe(true);
    expect(resumed.npcs[0].command).toBeNull();
    expect(resumed.npcs[0].position).not.toEqual(paused.npcs[0].position);
  });

  it('spends paused food once without advancing needs or overdrawing shared inventory', () => {
    const paused: GameState = { ...createGame({ seed: 23 }), status: 'paused', food: 1 };
    for (const npc of paused.npcs) npc.hunger = 90;
    const fed = issueCommand(paused, { type: 'feed', npcId: 'azhuang' });
    expect(fed.food).toBe(0);
    expect(fed.stats.meals).toBe(1);
    expect(fed.npcs[0].hunger).toBe(46);
    expect(fed.elapsed).toBe(paused.elapsed);
    expect(advanceGame(fed, 60, choose('eat'))).toEqual(fed);
    const repeated = issueCommand(fed, { type: 'feed', npcId: 'azhuang' });
    const contested = issueCommand(repeated, { type: 'feed', npcId: 'xiaomi' });
    expect(contested.food).toBe(0);
    expect(contested.stats.meals).toBe(1);
    expect(contested.npcs[0].hunger).toBe(46);
    expect(contested.npcs[1].hunger).toBe(90);
    expect(paused.food).toBe(1);
  });

  it('does not let paused task changes reset the encouragement cooldown at time zero', () => {
    const paused: GameState = { ...createGame({ seed: 23 }), status: 'paused' };
    const praised = issueCommand(paused, { type: 'praise', npcId: 'azhuang' });
    expect(praised.npcs[0].morale).toBe(paused.npcs[0].morale + 8);
    const assigned = issueCommand(praised, { type: 'assign', npcId: 'azhuang', action: 'wood' });
    const repeated = issueCommand(assigned, { type: 'praise', npcId: 'azhuang' });
    expect(repeated.npcs[0].morale).toBe(praised.npcs[0].morale);
    expect(repeated.npcs[0].trust).toBe(praised.npcs[0].trust);
    const recalled = issueCommand(repeated, { type: 'recall' });
    const again = issueCommand(recalled, { type: 'praise', npcId: 'azhuang' });
    expect(again.npcs[0].morale).toBe(praised.npcs[0].morale);
    expect(again.elapsed).toBe(0);
  });

  it('returns fresh states and exposes the agreed finite 41-value observation', () => {
    const state = { ...createGame({ seed: 5 }), status: 'playing' as const };
    const commanded = issueCommand(state, { type: 'assign', npcId: 'azhuang', action: 'wood' });
    expect(state.npcs[0].command).toBeNull();
    expect(commanded.npcs[0].command).toBe('wood');
    const observation = getObservation(commanded, commanded.npcs[0]);
    expect(observation.features).toHaveLength(41);
    expect(observation.features[23]).toBe(1);
    expect(observation.features.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    const next = advanceGame(commanded, .25, survivalPolicy);
    expect(next).not.toBe(commanded);
    expect(commanded.elapsed).toBe(0);
    expect(next.decisions.length).toBeGreaterThan(0);
  });

  it('replays the same seed, player inputs and policy deterministically', () => {
    const replay = () => {
      let state: GameState = { ...createGame({ seed: 8843, difficulty: 'normal' }), status: 'playing' };
      for (let i = 0; i < 720; i++) {
        if (i === 80) state = issueCommand(state, { type: 'priority', priority: 'food' });
        if (i === 200) state = issueCommand(state, { type: 'praise', npcId: 'xiaomi' });
        state = advanceGame(state, .25, survivalPolicy);
      }
      return state;
    };
    expect(replay()).toEqual(replay());
  });

  it('lets the policy accept or decline a player request instead of scripting compliance', () => {
    const initial: GameState = { ...createGame({ seed: 5 }), status: 'playing' };
    const commanded = issueCommand(initial, { type: 'assign', npcId: 'azhuang', action: 'wood' });
    const declined = advanceGame(commanded, .25, choose('rest'));
    expect(declined.npcs[0].action).toBe('rest');
    expect(declined.npcs[0].refusals).toBe(1);
    expect(declined.decisions[0].accepted).toBe(false);
    const accepted = advanceGame(commanded, .25, choose('wood'));
    expect(accepted.npcs[0].action).toBe('wood');
    expect(accepted.decisions[0].accepted).toBe(true);
    expect(accepted.npcs[0].command).toBeNull();
  });

  it('masks contested jobs and executes stock transactions without overspending', () => {
    const state: GameState = { ...createGame({ seed: 8 }), status: 'playing', food: 1, wood: 2 };
    state.npcs[0].action = 'fire';
    expect(getAllowedActions(state, state.npcs[1])).not.toContain('fire');
    state.npcs[0].action = 'eat';
    expect(getAllowedActions(state, state.npcs[1])).not.toContain('eat');
    state.npcs[0].action = null;
    for (const npc of state.npcs) npc.hunger = 90;
    const result = play(state, choose('eat'), 18);
    expect(result.food).toBe(0);
    expect(result.stats.meals).toBe(1);
    expect(result.wood).toBeGreaterThanOrEqual(0);
  });

  it('completes gather, carrying and delivery before adding resources to the shared camp', () => {
    const state: GameState = { ...createGame({ seed: 17, difficulty: 'cozy' }), status: 'playing', wood: 0 };
    const result = play(state, choose('wood'), 35);
    expect(result.stats.gatheredWood).toBeGreaterThan(0);
    expect(result.wood).toBeGreaterThan(0);
    expect(result.npcs.some((npc) => npc.completedTasks > 0)).toBe(true);
  });

  it('can win through real actions and can lose through neglected survival needs', () => {
    const win = play(createGame({ seed: 17, difficulty: 'cozy' }), survivalPolicy);
    expect(win.status, `${win.resultReason}; fire=${win.fire}; NPCs=${JSON.stringify(win.npcs.map((n) => ({ health: n.health, hunger: n.hunger, energy: n.energy, action: n.action, position: n.position })))}`).toBe('won');
    expect(win.elapsed).toBe(240);
    expect(win.npcs.every((npc) => npc.alive)).toBe(true);
    expect(win.fire).toBeGreaterThan(0);
    expect(win.score).toBeGreaterThan(0);
    const loss = play(createGame({ seed: 17, difficulty: 'hard', scenario: 'storm' }), choose('camp'));
    expect(loss.status).toBe('lost');
    expect(loss.resultReason.length).toBeGreaterThan(0);
  });

  it('rejects broken policy outputs and keeps histories, stats and resources finite', () => {
    const broken: PolicyFunction = () => ({ action: 'bogus' as ActionId, emotion: 'calm', scores: [Number.NaN], source: 'model', latencyMs: Infinity });
    const result = play(createGame({ seed: 777, difficulty: 'cozy' }), broken, 240);
    expect(result.stats.fallbackDecisions).toBeGreaterThan(0);
    expect(result.events.length).toBeLessThanOrEqual(80);
    expect(result.decisions.length).toBeLessThanOrEqual(180);
    expect([result.wood, result.food, result.fire, result.danger, result.elapsed, result.score].every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    for (const npc of result.npcs) {
      expect([npc.health, npc.energy, npc.hunger, npc.morale, npc.trust, npc.fear].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)).toBe(true);
      expect(npc.progress).toBeGreaterThanOrEqual(0);
      expect(npc.progress).toBeLessThanOrEqual(1);
      expect(npc.inventory.wood).toBeGreaterThanOrEqual(0);
      expect(npc.inventory.food).toBeGreaterThanOrEqual(0);
    }
    expect(result.decisions.every((decision) => decision.scores.length === 8 && decision.scores.every(Number.isFinite))).toBe(true);
  });
});
