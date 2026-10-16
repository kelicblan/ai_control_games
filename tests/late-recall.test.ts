import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodePolicy, inferPolicy, type LoadedPolicy } from '../src/games/camp/ai/policy';
import { advanceGame, advanceGameSteps, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { isAtCamp } from '../src/games/camp/simulation/constants';
import { ACTIONS, type ActionId, type GameState, type PolicyFunction } from '../src/games/camp/simulation/types';

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
  const state: GameState = { ...createGame({ seed: 17 }), food: 90, status: 'playing', elapsed };
  state.weatherUntil = 3600; state.nextWorldEvent = 3600;
  state.atmosphere.nextLightningAt = 3600;
  state.social.introduced = true;
  state.social.nextCheckAt = 3600; state.social.nextPromptAt = 3600;
  return state;
}

function advance(state: GameState, seconds: number, policy: PolicyFunction): GameState {
  const steps = Math.floor(seconds * 10 + 1e-8);
  const next = advanceGameSteps(state, steps, policy);
  const remainder = seconds - steps / 10;
  return remainder > 1e-8 ? advanceGame(next, remainder, policy) : next;
}

describe('explicit recall intent in continuous survival', () => {
  it('keeps the real seed17 MLP journey safely in camp across the former deadline when stocked', () => {
    let state: GameState = { ...createGame({ seed: 17, difficulty: 'cozy', scenario: 'standard', mode: 'model' }), status: 'playing' };
    const policy: PolicyFunction = observation => inferPolicy(model, observation);
    state = advance(state, 210, policy);
    expect(state.status).toBe('playing');
    state.food = 90; // Isolate recall from the higher-priority survival reserve.
    const firstRecallDecisionId = state.nextDecisionId;
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, 30, policy);
    expect(state.status, state.resultReason).toBe('playing');
    expect(state.elapsed).toBe(240);
    expect(state.npcs.every(npc => npc.alive && isAtCamp(npc))).toBe(true);
    // 210 秒同一时间戳里可能已有召回前的自主决定，用递增 ID 区分真正的命令之后。
    const recalled = state.decisions.filter(decision => decision.id >= firstRecallDecisionId);
    expect(recalled.length).toBeGreaterThan(10);
    // MLP 读取 44 维输入和持续召回意图；执行层的安全集合覆盖必须如实标记。
    expect(recalled.every(decision => decision.features.length === 44 && decision.features[29] === 1)).toBe(true);
    const safetyDecisions = recalled.filter(decision => decision.source === 'rules');
    expect(safetyDecisions.length).toBeGreaterThan(0);
    expect(safetyDecisions.some(decision => decision.reason?.includes('安全集合区'))).toBe(true);
    expect(safetyDecisions.every(decision => !!decision.reason)).toBe(true);
    expect(state.stats.fallbackDecisions).toBe(0);
  }, 60_000); // Nine NPCs, real warehouse routes and 100ms inference replay exceed the old camp's 20s wall-time budget.

  it('preserves sustained recall through weather review without inventing cooperation rewards', () => {
    let state = quietState();
    const initialTrust = state.npcs[0].trust;
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, 8, choose('camp'));
    expect(state.npcs[0].command).toBe('camp');
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust);
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.text.includes('开始执行「返回村寨」')).length).toBe(1);
    state = issueCommand(state, { type: 'weather', weather: 'rain' });
    state = advance(state, .6, choose('rest'));
    const changed = state.decisions.filter(decision => decision.npcId === 'azhuang').at(-1)!;
    expect(changed).toMatchObject({ source: 'rules', trigger: 'weather', action: 'camp', accepted: true });
    expect(changed.reason).toContain('安全集合区');
    expect(changed.features[29]).toBe(1);
    if (state.npcs[0].action === null) state = advance(state, .7, choose('rest'));
    expect(state.npcs[0].action).toBe('camp');
    expect(state.npcs[0].command).toBe('camp');
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust);
    expect(state.npcs[0].refusals).toBe(0);
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.text.includes('开始执行「返回村寨」')).length).toBe(1);
  });

  it('records one refusal per explicit recall without recounting a continuing unmet intent', () => {
    let state = quietState();
    // 身体濒危优先于安全集合；一次明确召回只记一次拒绝，持续意图不重复计数。
    state.npcs[0].energy = 1;
    const initialTrust = state.npcs[0].trust;
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, 8, choose('rest'));
    expect(state.npcs[0].command).toBe('camp');
    expect(state.npcs[0].refusals).toBe(1);
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust);
    expect(state.decisions.find(decision => decision.npcId === 'azhuang')?.reason).toContain('身体已濒危');
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.text.includes('暂未接受安排')).length).toBe(1);
    state.npcs[0].energy = 1;
    state = issueCommand(state, { type: 'recall' });
    state = advance(state, .1, choose('rest'));
    expect(state.npcs[0].refusals).toBe(2);
    expect(state.npcs[0].trust).toBeCloseTo(initialTrust);
  });

  it('retains an explicit camp assignment independently of elapsed time', () => {
    let state = quietState(209);
    state = issueCommand(state, { type: 'assign', npcId: 'azhuang', action: 'camp' });
    state = advance(state, .1, choose('camp'));
    expect(state.npcs[0].command).toBe('camp');
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
