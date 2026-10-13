import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { ACTIONS, type ActionId, type GameState, type PolicyFunction } from '../src/games/camp/simulation/types';
import { updateAtmosphere } from '../src/games/camp/simulation/weather';

const choose = (action: ActionId): PolicyFunction => observation => ({
  action: observation.allowed.includes(action) ? action : 'rest', emotion: 'calm',
  scores: ACTIONS.map(candidate => Number(candidate === action)), source: 'rules', latencyMs: 0,
});

function playing(seed = 17): GameState {
  return { ...createGame({ seed }), status: 'playing', nextWorldEvent: 300 };
}

describe('living weather', () => {
  it('starts with bounded atmosphere, intact shelter and dry people', () => {
    const state = createGame({ seed: 17 });
    expect(state.atmosphere).toEqual(expect.objectContaining({ lightningAt: -1, lightningPoint: null, revision: 0 }));
    expect(state.atmosphere.windStrength).toBeGreaterThanOrEqual(0);
    expect(state.atmosphere.windStrength).toBeLessThanOrEqual(1);
    expect(state.shelterIntegrity).toBe(100);
    expect(state.npcs.every(npc => npc.wetness === 0)).toBe(true);
    expect(state.weatherUntil).toBeGreaterThanOrEqual(10);
    expect(state.weatherUntil).toBeLessThanOrEqual(15);
  });

  it('begins a changing forecast early and preserves it while paused', () => {
    const state = playing();
    const paused = { ...state, status: 'paused' as const };
    expect(advanceGame(paused, 30, choose('rest'))).toEqual(paused);
    const next = advanceGame(state, 15, choose('rest'));
    expect(next.atmosphere.revision).toBeGreaterThan(0);
    expect(next.weather).not.toBe('clear');
  });

  it('records player weather intervention without choosing a task for a person', () => {
    const state = playing();
    const next = issueCommand(state, { type: 'weather', weather: 'storm' });
    expect(next.weather).toBe('storm');
    expect(next.elapsed).toBe(0);
    expect(next.decisions).toHaveLength(0);
    expect(next.events.some(event => event.text.includes('你') && event.text.includes('雷'))).toBe(true);
  });

  it('turns and strengthens the wind gradually when a different weather front arrives', () => {
    for (const seed of [17, 81, 913]) {
      let state = playing(seed);
      for (const weather of ['storm', 'clear', 'wind', 'rain'] as const) {
        state = issueCommand(state, { type: 'weather', weather });
        const before = { ...state.atmosphere };
        state.elapsed += .1;
        updateAtmosphere(state, .1);
        const turn = Math.atan2(Math.sin(state.atmosphere.windAngle - before.windAngle), Math.cos(state.atmosphere.windAngle - before.windAngle));
        expect(Math.abs(turn)).toBeLessThanOrEqual(.056);
        expect(Math.abs(state.atmosphere.windStrength - before.windStrength)).toBeLessThan(.08);
        expect(state.atmosphere.windAngle).toBeGreaterThanOrEqual(0);
        expect(state.atmosphere.windAngle).toBeLessThan(Math.PI * 2);
      }
    }
  });

  it('lets a sustained gale build and then die down without a discontinuous snap', () => {
    const state = issueCommand(playing(17), { type: 'weather', weather: 'wind' });
    for (let i = 0; i < 80; i++) { state.elapsed += .1; updateAtmosphere(state, .1); }
    expect(state.atmosphere.windStrength).toBeGreaterThan(.4);
    const clear = issueCommand(state, { type: 'weather', weather: 'clear' });
    for (let i = 0; i < 80; i++) { clear.elapsed += .1; updateAtmosphere(clear, .1); }
    expect(clear.atmosphere.windStrength).toBeLessThan(.17);
  });

  it('gives different policies the same forecast, gusts and lightning with the same seed', () => {
    let workers = playing(913);
    let campers = playing(913);
    const forecasts: string[] = [];
    for (let step = 0; step < 300; step++) {
      workers = advanceGame(workers, .25, choose('explore'));
      campers = advanceGame(campers, .25, choose('rest'));
      expect(workers.elapsed).toBe(campers.elapsed);
      expect(workers.atmosphere).toEqual(campers.atmosphere);
      expect(workers.weather).toBe(campers.weather);
      expect(workers.weatherUntil).toBe(campers.weatherUntil);
      forecasts.push(workers.weather);
    }
    expect(new Set(forecasts).size).toBeGreaterThanOrEqual(3);
    expect(workers.stats.gatheredWood).not.toBe(campers.stats.gatheredWood);
  });

  it('has the same weather and simulation when fixed substeps are batched', () => {
    const initial = issueCommand(playing(73), { type: 'weather', weather: 'storm' });
    const batched = advanceGame(initial, 12, choose('rest'));
    let individual = initial;
    for (let step = 0; step < 48; step++) individual = advanceGame(individual, .25, choose('rest'));
    expect(batched).toEqual(individual);
    expect(batched.atmosphere.lightningAt).toBeGreaterThan(0);
    expect(batched.atmosphere.lightningPoint).not.toBeNull();
  });

  it('asks the policy again on weather change and executes its actual choice', () => {
    const initial = playing();
    const npc = initial.npcs[0];
    npc.action = 'wood'; npc.actionDuration = 5.5; npc.progress = .4;
    npc.position = { x: 17, y: 38 }; npc.destination = { ...npc.position };
    const storm = issueCommand(initial, { type: 'weather', weather: 'storm' });
    const next = advanceGame(storm, .25, choose('food'));
    expect(next.npcs[0].action).toBe('food');
    const decision = next.decisions.find(record => record.npcId === npc.id)!;
    expect(decision).toEqual(expect.objectContaining({ action: 'food', source: 'rules', trigger: 'weather', previousAction: 'wood', featureVersion: 2 }));
    expect(decision.weather).toEqual(expect.objectContaining({ kind: 'storm', wetness: expect.any(Number), exposure: 1 }));
    expect(decision.features).toHaveLength(41);
    expect(next.events.some(event => event.npcId === npc.id && event.text.includes('采集食物'))).toBe(true);
  });

  it('keeps work progress when the weather re-evaluation chooses the same task', () => {
    const initial = playing();
    const npc = initial.npcs[0];
    npc.action = 'wood'; npc.actionDuration = 5.5; npc.progress = .4;
    npc.position = { x: 17, y: 38 }; npc.destination = { ...npc.position };
    const next = advanceGame(issueCommand(initial, { type: 'weather', weather: 'rain' }), .25, choose('wood'));
    expect(next.npcs[0].action).toBe('wood');
    expect(next.npcs[0].progress).toBeGreaterThan(.4);
    expect(next.stats.taskSwitches).toBe(0);
  });

  it('protects manual movement and committed supplies until their current leg completes', () => {
    let initial = playing();
    initial.npcs[0].position = { x: 30, y: 80 };
    initial = issueCommand(initial, { type: 'move', npcId: 'azhuang', target: { x: 45, y: 80 } });
    const carrier = initial.npcs[1];
    carrier.action = 'wood'; carrier.inventory.wood = 3;
    carrier.position = { x: 20, y: 38 }; carrier.destination = { x: 49, y: 65 };
    carrier.actionDuration = 1.1;
    const storm = issueCommand(initial, { type: 'weather', weather: 'storm' });
    const next = advanceGame(storm, .25, choose('rest'));
    expect(next.npcs[0].manualTarget).toEqual({ x: 45, y: 80 });
    expect(next.npcs[0].action).toBeNull();
    expect(next.npcs[1].action).toBe('wood');
    expect(next.npcs[1].destination).toEqual(carrier.destination);
    expect(next.npcs[1].inventory.wood).toBe(3);
    expect(next.decisions.some(record => record.npcId === 'azhuang' || record.npcId === 'xiaomi')).toBe(false);
  });

  it('supplies detached raw world context to inference', () => {
    const initial = issueCommand(playing(), { type: 'weather', weather: 'rain' });
    let inspected = false;
    const policy: PolicyFunction = observation => {
      expect(observation.context).toBeDefined();
      expect(observation.context?.weather.kind).toBe('rain');
      expect(observation.context?.resources.food).toBe(initial.food);
      if (observation.context) {
        observation.context.self.position.x = 999;
        observation.context.weather.shelterIntegrity = -999;
        observation.context.allies[0].position.x = 999;
      }
      inspected = true;
      return choose('rest')(observation);
    };
    const next = advanceGame(initial, .25, policy);
    expect(inspected).toBe(true);
    expect(next.npcs.every(npc => npc.position.x < 100)).toBe(true);
    expect(next.decisions.every(record => record.weather!.shelterIntegrity > 0)).toBe(true);
  });

  it('soaks exposed people while the actual shelter awning lets a resting person dry', () => {
    const initial = playing();
    for (const [index, npc] of initial.npcs.entries()) {
      npc.position = index === 0 ? { x: 68, y: 73.2 } : { x: 45 + index * 3, y: 65 };
      npc.destination = { ...npc.position }; npc.action = 'rest'; npc.actionDuration = 300;
      npc.energy = 40; npc.wetness = 35; npc.decisionIn = 300;
    }
    const rainy = advanceGame(issueCommand(initial, { type: 'weather', weather: 'rain' }), 8, choose('rest'));
    expect(rainy.npcs[0].wetness).toBeLessThan(35);
    expect(rainy.npcs[1].wetness).toBeGreaterThan(35);
    expect(rainy.npcs[1].energy).toBeLessThan(rainy.npcs[0].energy);
    expect(rainy.shelterIntegrity).toBeLessThan(100);
    const clear = advanceGame(initial, 8, choose('rest'));
    expect(rainy.fire).toBeLessThan(clear.fire);
  });

  it('reports thunder as a genuine re-evaluation and keeps all hazard effects bounded', () => {
    let state = issueCommand(playing(81), { type: 'weather', weather: 'storm' });
    state = advanceGame(state, 16, choose('rest'));
    expect(state.atmosphere.lightningAt).toBeGreaterThan(0);
    expect(state.events.some(event => event.text.includes('雷声'))).toBe(true);
    expect(state.decisions.some(decision => decision.trigger === 'thunder')).toBe(true);
    expect(state.npcs.every(npc => npc.health > 90 && npc.fear >= 0 && npc.fear <= 100 && npc.wetness >= 0 && npc.wetness <= 100)).toBe(true);
  });
});
