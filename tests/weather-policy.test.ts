import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACTIONS, type PolicyObservation } from '../src/games/camp/simulation/types';
import { FEATURE_NAMES, getObservation } from '../src/games/camp/simulation/observation';
import { createGame } from '../src/games/camp/simulation/engine';
import { createAtmosphere } from '../src/games/camp/simulation/weather';
import { baselinePolicy, decodePolicy, inferPolicy, type LoadedPolicy } from '../src/games/camp/ai/policy';

let model: LoadedPolicy;

beforeAll(async () => {
  const manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8'));
  const bytes = await readFile('public/models/policy.f32');
  model = decodePolicy(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

/** The mask stays identical in paired cases: weather must change scores, not feasibility. */
function observation(changes: Record<number, number> = {}): PolicyObservation {
  const base = [
    .2, .85, .96, .72, .05, .74, .27, .8, .65,
    .2, .25, .75, .03, .3, 0, 0, 0, .95, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .45, 0, 0,
    0, 0, 1, 1, .45,
  ];
  return {
    features: FEATURE_NAMES.map((_, index) => changes[index] ?? base[index]),
    allowed: ['wood', 'food', 'fire', 'eat', 'rest', 'camp', 'explore'],
    npcId: 'xiaomi',
  };
}

describe('weather decisions from the bundled neural weights', () => {
  it('ships the explicit 41-feature weather and shelter contract', () => {
    expect(FEATURE_NAMES).toHaveLength(41);
    expect(FEATURE_NAMES.slice(14, 16)).toEqual(['rainIntensity', 'windStrength']);
    expect(FEATURE_NAMES.slice(36)).toEqual(['stormRisk', 'wetness', 'exposure', 'shelterIntegrity', 'shelterDistance']);
    expect(model.manifest.featureNames).toEqual(FEATURE_NAMES);
  });

  it('changes a cautious exposed worker from gathering to shelter when only the weather changes', () => {
    const clear = observation();
    const storm = observation({ 14: .95, 15: .85, 36: .9 });
    expect(storm.allowed).toEqual(clear.allowed);
    for (const run of [(value: PolicyObservation) => inferPolicy(model, value), baselinePolicy]) {
      expect(run(clear).action).toBe('food');
      expect(run(storm).action).toBe('rest');
      expect(run(storm).scores[ACTIONS.indexOf('rest')]).toBeGreaterThan(run(clear).scores[ACTIONS.indexOf('rest')]);
    }
    expect(inferPolicy(model, storm).source).toBe('model');
  });

  it('lets a brave NPC protect a low fire while a cautious peer seeks shelter in the same storm', () => {
    const shared = { 9: .4, 10: .5, 11: .2, 14: .9, 15: .8, 33: .18, 36: .85, 37: .3, 40: .25 };
    const cautious = observation({ ...shared, 6: .27 });
    const brave = observation({ ...shared, 6: .9 });
    expect(cautious.allowed).toEqual(brave.allowed);
    for (const run of [(value: PolicyObservation) => inferPolicy(model, value), baselinePolicy]) {
      expect(run(cautious).action).toBe('rest');
      expect(run(brave).action).toBe('fire');
    }
  });

  it('responds to wetness and available shelter without forcing every weather state into the same action', () => {
    const wet = observation({ 14: .5, 15: .3, 37: .9, 40: .2 });
    const fireEmergency = observation({ 6: .9, 9: .4, 11: .03, 14: .55, 15: .45, 33: .12, 36: .1, 38: .2, 40: .05 });
    expect(inferPolicy(model, wet).action).toBe('rest');
    expect(inferPolicy(model, fireEmergency).action).toBe('fire');
  });

  it('produces finite real logits and legal normalized scores across continuous weather intensities', () => {
    for (let step = 0; step <= 10; step += 1) {
      const value = step / 10;
      const observed = observation({ 14: value, 15: 1 - value, 36: value, 37: value, 38: value, 39: 1 - value, 40: value });
      const logits = model.predict(observed.features);
      expect(logits.action.every(Number.isFinite)).toBe(true);
      expect(logits.emotion.every(Number.isFinite)).toBe(true);
      const result = inferPolicy(model, observed);
      expect(observed.allowed).toContain(result.action);
      expect(result.scores.every(Number.isFinite)).toBe(true);
      expect(result.scores.reduce((sum, score) => sum + score, 0)).toBeCloseTo(1, 10);
      expect(result.scores[ACTIONS.indexOf('help')]).toBe(0);
    }
  });

  it('uses rain, wind and thunder risk as separate learned inputs', () => {
    const clear = model.predict(observation().features).action;
    for (const index of [14, 15, 36]) {
      const changed = model.predict(observation({ [index]: .9 }).features).action;
      expect(Math.max(...changed.map((value, action) => Math.abs(value - clear[action])))).toBeGreaterThan(.1);
    }
  });
});

describe('shared weather observation for neural and future language adapters', () => {
  it('normalizes the MLP vector while retaining the same raw world values in detached structured context', () => {
    const game = createGame({ seed: 41 });
    game.weather = 'storm';
    game.atmosphere = { ...createAtmosphere(game.seed, 'storm'), rainIntensity: .72, windStrength: .81, stormRisk: .88 };
    game.shelterIntegrity = 75;
    const npc = game.npcs[0];
    npc.wetness = 64;
    npc.position = { x: 54.5, y: 72.5 };
    const observed = getObservation(game, npc);
    expect(observed.features.slice(14, 16)).toEqual([.72, .81]);
    expect(observed.features.slice(36)).toEqual([.88, .64, 1, .75, .1]);
    expect(observed.context?.weather).toEqual({
      kind: 'storm', rainIntensity: .72, windStrength: .81, stormRisk: .88,
      wetness: 64, exposure: 1, shelterIntegrity: 75, shelterDistance: 10,
    });
    expect(observed.context?.resources).toEqual({ wood: game.wood, food: game.food, fire: game.fire });
    expect(observed.context?.allies.map(ally => ally.id)).toEqual(['xiaomi', 'laozhou', 'linlan', 'aye']);
    expect(observed.features.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);

    observed.context!.self.position.x = 0;
    observed.context!.allies[0].position.y = 0;
    observed.context!.weather.wetness = 0;
    expect(npc.position.x).toBe(54.5);
    expect(game.npcs[1].position.y).not.toBe(0);
    expect(npc.wetness).toBe(64);
  });

  it('lets weather alter observation values without turning gathering into a forbidden action', () => {
    const game = createGame({ seed: 41 });
    game.atmosphere = createAtmosphere(game.seed, 'clear');
    game.shelterIntegrity = 100;
    const npc = game.npcs[1];
    npc.wetness = 0;
    const clear = getObservation(game, npc);
    game.weather = 'storm';
    game.atmosphere = createAtmosphere(game.seed, 'storm');
    const storm = getObservation(game, npc);
    expect(storm.allowed).toEqual(clear.allowed);
    expect(storm.allowed).toContain('food');
    expect(storm.allowed).toContain('wood');
    expect(storm.features[36]).toBeGreaterThan(clear.features[36]);
    npc.position = { x: 71, y: 72.5 };
    const protectedObservation = getObservation(game, npc);
    expect(protectedObservation.features[38]).toBeCloseTo(.04, 10);
    expect(protectedObservation.features[40]).toBe(0);
  });
});
