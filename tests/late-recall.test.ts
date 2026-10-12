import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodePolicy, inferPolicy, type LoadedPolicy } from '../src/ai/policy';
import { advanceGame, createGame, issueCommand } from '../src/game/engine';
import { isAtCamp } from '../src/game/constants';
import { ACTIONS, type ActionId, type GameState, type PolicyFunction } from '../src/game/types';

let model: LoadedPolicy;
beforeAll(async () => {
  const manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8'));
  const bytes = await readFile('public/models/policy.f32');
  model = decodePolicy(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

const choose = (action: ActionId): PolicyFunction => () => ({
  action, emotion: 'calm', source: 'model', latencyMs: 0,
  scores: ACTIONS.map(candidate => Number(candidate === action)),
});

function quietState(elapsed = 210): GameState {
  const state: GameState = { ...createGame({ seed: 17 }), status: 'playing', elapsed };
  state.weatherUntil = 3600; state.nextWorldEvent = 3600;
  state.atmosphere.nextLightningAt = 3600;
  state.social.introduced = true;
  state.social.nextCheckAt = 3600; state.social.nextPromptAt = 3600;
  return state;
}

function advance(state: GameState, seconds: number, policy: PolicyFunction): GameState {
  for (let tick = 0; tick < seconds * 10 && state.status === 'playing'; tick++) state = advanceGame(state, .1, policy);
  return state;
}

describe('last half-minute recall intent', () => {
  it('keeps the real seed17 MLP journey safely in camp after its 210-second recall', () => {
    let state: GameState = { ...createGame({ seed: 17, difficulty: 'cozy', scenario: 'standard', mode: 'model' }), status: 'playing' };
    const policy: PolicyFunction = observation => inferPolicy(model, observation);
    state = advance(state, 210, policy);
    expect(state.status).toBe('playing');
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, 30, policy);
    expect(state.status, state.resultReason).toBe('won');
    expect(state.elapsed).toBe(240);
    expect(state.npcs.every(npc => npc.alive && isAtCamp(npc))).toBe(true);
    const recalled = state.decisions.filter(decision => decision.time >= 210);
    expect(recalled.length).toBeGreaterThan(10);
    expect(recalled.every(decision => decision.source === 'model' && decision.features[29] === 1)).toBe(true);
    expect(state.stats.fallbackDecisions).toBe(0);
    expect(state.stats.ruleDecisions).toBe(0);
  }, 20_000);

  it('reads sustained intent in routine/weather inference without repeating rewards or enforcing an action', () => {
    let state = quietState();
    const initialTrust = state.npcs[0].trust;
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, 8, choose('camp'));
    expect(state.npcs[0].command).toBe('camp');
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust + .8);
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.text.includes('接受了「返回营地」')).length).toBe(1);
    state = issueCommand(state, { type: 'weather', weather: 'rain' });
    state = advance(state, .6, choose('rest'));
    const changed = state.decisions.filter(decision => decision.npcId === 'azhuang').at(-1)!;
    expect(changed).toMatchObject({ source: 'model', trigger: 'weather', action: 'rest', accepted: false });
    expect(changed.features[29]).toBe(1);
    expect(state.npcs[0].action).toBe('rest');
    expect(state.npcs[0].command).toBe('camp');
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust + .8);
    expect(state.npcs[0].refusals).toBe(0);
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.text.includes('接受了「返回营地」')).length).toBe(1);
  });

  it('records one refusal per explicit recall without recounting a continuing unmet intent', () => {
    let state = quietState();
    const initialTrust = state.npcs[0].trust;
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, 8, choose('rest'));
    expect(state.npcs[0].command).toBe('camp');
    expect(state.npcs[0].refusals).toBe(1);
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust - .5);
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.text.includes('暂未接受安排')).length).toBe(1);
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, .1, choose('rest'));
    expect(state.npcs[0].refusals).toBe(2);
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust - 1);
  });

  it('still consumes an early camp assignment once', () => {
    let state = quietState(209);
    state = issueCommand(state, { type: 'assign', npcId: 'azhuang', action: 'camp' });
    state = advance(state, .1, choose('camp'));
    expect(state.npcs[0].command).toBeNull();
  });

  it.each([null, 'wood'] as const)('allows a new %s assignment to replace the retained camp intent', action => {
    let state = advance(issueCommand(quietState(), { type: 'recall' }), .1, choose('camp'));
    state = issueCommand(state, { type: 'assign', npcId: 'azhuang', action });
    expect(state.npcs[0].command).toBe(action);
    state = advance(state, .1, choose(action ?? 'rest'));
    expect(state.npcs[0].command).toBeNull();
    expect(state.decisions.filter(decision => decision.npcId === 'azhuang').at(-1)!.features[29]).toBe(0);
  });

  it('allows manual movement to clear retained recall intent', () => {
    let state = advance(issueCommand(quietState(), { type: 'recall' }), .1, choose('camp'));
    state = issueCommand(state, { type: 'move', npcId: 'azhuang', target: { x: 40, y: 80 } });
    expect(state.npcs[0].command).toBeNull();
    expect(state.npcs[0].manualTarget).toEqual({ x: 40, y: 80 });
  });

  it('lets a new social agreement replace recall while recording its explicit rules source', () => {
    let state = advance(issueCommand(quietState(), { type: 'recall' }), .1, choose('camp'));
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
    state = issueCommand(state, { type: 'social-reply', threadId: state.social.threads.at(-1)!.id, choiceId: 'rest' });
    expect(state.npcs[0].command).toBe('rest');
    state = advance(state, .1, choose('camp'));
    expect(state.npcs[0].command).toBeNull();
    expect(state.decisions.filter(decision => decision.npcId === 'azhuang').at(-1)).toMatchObject({ source: 'rules', trigger: 'social', action: 'rest' });
  });
});
