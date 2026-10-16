import { describe, expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { FEATURE_NAMES, getAllowedActions, getObservation } from '../src/games/camp/simulation/observation';

describe('nine-person task observations', () => {
  it('keeps all eight allies in context and uses the village survival model schema', () => {
    const state = createGame({ seed: 19 });
    expect(state.npcs.map(npc => npc.id)).toEqual(['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye', 'tiesheng', 'aling', 'xiaoman', 'shenyan']);
    for (const person of state.npcs) {
      const observation = getObservation(state, person);
      expect(observation.features).toHaveLength(44);
      expect(observation.features.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      expect(observation.context!.allies.map(ally => ally.id)).toEqual(state.npcs.filter(ally => ally.id !== person.id).map(ally => ally.id));
    }
    expect(FEATURE_NAMES[19]).toBe('woodWorkers');
  });

  it('preserves half-count worker inputs and saturates at two allies instead of changing model units', () => {
    const state = createGame();
    const [self, ...others] = state.npcs;
    others.forEach(npc => { npc.action = 'rest'; npc.injured = false; });
    others[0].action = 'wood';
    others[0].injured = true;
    let observation = getObservation(state, self);
    expect(observation.features[19]).toBe(.5);
    expect(observation.features[18]).toBe(.5);
    expect(getAllowedActions(state, self)).toContain('wood');
    others.slice(1).forEach(npc => { npc.action = 'wood'; npc.injured = true; });
    observation = getObservation(state, self);
    expect(observation.features[19]).toBe(1);
    expect(observation.features[18]).toBe(1);
    expect(getAllowedActions(state, self)).not.toContain('wood');
    others.forEach(npc => { npc.alive = false; });
    observation = getObservation(state, self);
    expect(observation.features[19]).toBe(0);
    expect(observation.features[18]).toBe(0);
    expect(observation.features[17]).toBe(1);
    expect(observation.context!.allies).toEqual([]);
  });
});
