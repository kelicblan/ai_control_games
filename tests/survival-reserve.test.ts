import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { getAllowedActions, getObservation } from '../src/games/camp/simulation/observation';
import { decideCampBehavior } from '../src/games/camp/npc/bridge';
import { ACTIONS, type PolicyResult } from '../src/games/camp/simulation/types';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { foodReserve } from '../src/games/camp/simulation/survival';
import { isValidGameState, restoreGameState } from '../src/games/camp/simulation/persistence';
import { requestMindReview } from '../src/games/camp/npc/bridge';

const rest: PolicyResult = { action: 'rest', emotion: 'calm', scores: ACTIONS.map(a => Number(a === 'rest')), source: 'rules', latencyMs: 0 };

describe('survival food reserve', () => {
  it('starts replenishing while people are not yet hungry despite a wood command and a strike', () => {
    const state = createGame({ seed: 17 });
    state.food = 10;
    const npc = state.npcs[3];
    npc.command = 'wood';
    npc.mind!.intent = { ...npc.mind!.intent, kind: 'strike', actionId: 'rest', until: 100 };
    const result = decideCampBehavior(state, npc, rest, getAllowedActions(state, npc)).result;
    expect(result.action).toBe('food');
    expect(npc.actionEffort).toBe(1);
  });

  it('lets more than two healthy NPCs collect when nine people need food', () => {
    const state = createGame({ seed: 17 });
    state.food = 0;
    state.npcs[0].action = 'food';
    state.npcs[1].action = 'food';
    expect(getAllowedActions(state, state.npcs[2])).toContain('food');
  });

  it('does not override a full warehouse with food gathering', () => {
    const state = createGame({ seed: 17 });
    state.food = 90;
    const npc = state.npcs[3];
    expect(decideCampBehavior(state, npc, rest, getAllowedActions(state, npc)).result.action).not.toBe('food');
  });

  it('preserves health, exhaustion, a closed gate and a committed return', () => {
    const state = createGame({ seed: 17 });
    state.food = 0;
    const npc = state.npcs[0];
    npc.energy = 20;
    expect(getAllowedActions(state, npc)).not.toContain('food');
    npc.energy = 90; npc.injured = true;
    expect(getAllowedActions(state, npc)).not.toContain('food');
    npc.injured = false; state.world!.gateOpen = false;
    expect(getAllowedActions(state, npc)).not.toContain('food');
    state.world!.gateOpen = true; npc.inventory.wood = 3;
    expect(getAllowedActions(state, npc)).toEqual(['rest', 'camp']);
  });

  it('trains the rules teacher to prioritize the reserve before personal starvation', () => {
    const state = createGame({ seed: 17 });
    state.food = 10;
    const npc = state.npcs[0];
    npc.command = 'wood';
    expect(baselinePolicy(getObservation(state, npc)).action).toBe('food');
  });

  it('scales the minimum with population and difficulty, with a bounded empty roster', () => {
    const state = createGame({ seed: 17 });
    const full = foodReserve(state);
    expect(full.minimum).toBeGreaterThanOrEqual(18);
    expect(foodReserve({ ...state, difficulty: 'hard' }).minimum).toBeGreaterThan(full.minimum);
    state.npcs.slice(3).forEach(n => { n.alive = false; n.health = 0; });
    expect(foodReserve(state).minimum).toBeLessThan(full.minimum);
    state.npcs.forEach(n => { n.alive = false; n.health = 0; });
    expect(foodReserve(state)).toMatchObject({ minimum: 0, target: 0, needsGatherer: false });
  });

  it('counts real deliveries once and stops dispatch when committed trips cover the target', () => {
    const state = createGame({ seed: 17 });
    state.food = 10;
    for (const n of state.npcs.slice(0, 6)) { n.action = 'food'; n.inventory.food = 4; }
    const reserve = foodReserve(state, state.npcs[8].id);
    expect(reserve.incoming).toBe(24);
    expect(reserve.committed).toBe(0);
    expect(reserve.needsGatherer).toBe(false);
    state.npcs.slice(0, 6).forEach(n => { n.alive = false; n.health = 0; });
    expect(foodReserve(state).incoming).toBe(0);
  });

  it('starts below the minimum, accounts for pending meals, and avoids idle dispatch at the minimum', () => {
    const state = createGame({ seed: 17 });
    const minimum = foodReserve(state).minimum;
    state.food = minimum;
    expect(foodReserve(state).needsGatherer).toBe(false);
    state.food--;
    expect(foodReserve(state).needsGatherer).toBe(true);
    state.food = minimum; state.npcs[0].action = 'eat';
    expect(foodReserve(state).needsGatherer).toBe(true);
    state.npcs[0].action = null; state.food = foodReserve(state).target;
    expect(foodReserve(state).needsGatherer).toBe(false);
  });

  it('does not count a missing assigned patch as future food', () => {
    const state = createGame({ seed: 17 });
    const npc = state.npcs[0]; npc.action = 'food';
    npc.wildTask = { kind: 'gather', targetId: 'berries-missing', label: 'berries', phase: 'travel', startedAt: 0, stalledFor: 0, meat: false };
    expect(foodReserve(state).committed).toBe(0);
  });

  it('retains v2 history alongside newly generated v3 records on reload', () => {
    const state = createGame({ seed: 17 }); state.status = 'playing';
    const next = advanceGame(state, .1, () => rest);
    next.decisions.push({ ...next.decisions[0], id: next.nextDecisionId++, featureVersion: 2, features: next.decisions[0].features.slice(0, 41) });
    const restored = restoreGameState(JSON.parse(JSON.stringify(next)));
    expect(restored).not.toBeNull();
    expect(restored!.decisions.at(-1)).toMatchObject({ featureVersion: 2 });
    expect(restored!.decisions[0]).toMatchObject({ featureVersion: 3 });
  });

  it('reconsiders a wood job immediately, executes gathering, and stores valid v3 decisions', () => {
    const state = createGame({ seed: 17 }); state.status = 'playing'; state.food = 10;
    const npc = state.npcs[0]; npc.action = 'wood'; npc.actionDuration = 5.5; npc.progress = .4;
    const next = advanceGame(state, .1, () => rest);
    expect(next.npcs[0].action).toBe('food');
    expect(next.npcs[0].wildTask?.kind).toBe('gather');
    expect(next.decisions.find(d => d.npcId === npc.id)).toMatchObject({ action: 'food', featureVersion: 3 });
    expect(isValidGameState(next)).toBe(true);
  });

  it('preserves a food trip through ordinary weather and social reviews but interrupts injury', () => {
    let state = createGame({ seed: 17 }); state.status = 'playing'; state.food = 10;
    state = advanceGame(state, .1, () => rest);
    const npc = state.npcs[0]; const target = npc.wildTask!.targetId;
    requestMindReview(state, npc);
    expect(npc.wildTask?.targetId).toBe(target);
    state = issueCommand(state, { type: 'weather', weather: 'rain' });
    state = advanceGame(state, .1, () => rest);
    expect(state.npcs[0].wildTask?.targetId).toBe(target);
    state.npcs[0].position = { x: 50, y: 315 }; state.npcs[0].injured = true;
    state = advanceGame(state, .1, () => rest);
    expect(state.npcs[0].action).toBe('camp');
    expect(state.npcs[0].wildTask).toBeUndefined();
  });
});
