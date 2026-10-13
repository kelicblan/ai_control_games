import { ACTIONS, type ActionId, type GameState, type Npc, type PolicyObservation } from './types';
import { clamp, distance, LOCATIONS } from './constants';
import { getWeatherSnapshot } from './weather';

/** Observation schema v2. Existing indices are retained; all 41 entries are in [0, 1].
 * Worker/help inputs retain the trained half-count units, saturated at two allies.
 * They are counts, not fractions of the current roster; five NPCs need no new weights.
 */
export const FEATURE_VERSION = 2;
export const FEATURE_NAMES: string[] = [
  'hunger', 'energy', 'health', 'morale', 'fear', 'trust',
  'bravery', 'diligence', 'empathy', 'wood', 'food', 'fire',
  'danger', 'time', 'rainIntensity', 'windStrength', 'injured', 'allyHealth',
  'alliesNeedHelp', 'woodWorkers', 'foodWorkers', 'fireWorkers', 'helpWorkers',
  'commandWood', 'commandFood', 'commandFire', 'commandEat', 'commandRest',
  'commandHelp', 'commandCamp', 'commandExplore', 'priorityWood', 'priorityFood',
  'distanceToCamp', 'carriedWood', 'carriedFood',
  'stormRisk', 'wetness', 'exposure', 'shelterIntegrity', 'shelterDistance',
];

export function getAllowedActions(state: GameState, npc: Npc): ActionId[] {
  if (!npc.alive) return [];
  // Carrying is a committed return leg. Both remaining options bring supplies into camp.
  if (npc.inventory.wood > 0 || npc.inventory.food > 0) return ['rest', 'camp'];
  const others = state.npcs.filter((other) => other.alive && other.id !== npc.id);
  const workers = (action: ActionId) => others.filter((other) => other.action === action).length;
  const allowed = new Set<ActionId>(['rest', 'camp']);
  if (npc.health > 12 && npc.energy >= 5 && workers('wood') < 2 && state.wood < 95) allowed.add('wood');
  if (npc.health > 12 && npc.energy >= 5 && workers('food') < 2 && state.food < 95) allowed.add('food');
  if (state.wood >= 1 && state.fire < 95 && workers('fire') === 0) allowed.add('fire');
  if (state.food > workers('eat') && npc.hunger >= 8) allowed.add('eat');
  if (workers('help') === 0 && others.some((other) => other.injured || other.health < 65)) allowed.add('help');
  if (npc.health > 30 && npc.energy >= 20 && workers('explore') === 0) allowed.add('explore');
  return ACTIONS.filter((action) => allowed.has(action));
}

export function getObservation(state: GameState, npc: Npc): PolicyObservation {
  const others = state.npcs.filter((other) => other.alive && other.id !== npc.id);
  const workers = (action: ActionId) => others.filter((other) => other.action === action).length / 2;
  const weather = getWeatherSnapshot(state, npc);
  const raw = [
    npc.hunger / 100, npc.energy / 100, npc.health / 100, npc.morale / 100,
    npc.fear / 100, npc.trust / 100, npc.personality.bravery, npc.personality.diligence,
    npc.personality.empathy, state.wood / 30, state.food / 15, state.fire / 100,
    state.danger / 100, state.elapsed / state.duration, weather.rainIntensity,
    weather.windStrength, Number(npc.injured),
    others.length ? Math.min(...others.map((other) => other.health)) / 100 : 1,
    others.filter((other) => other.injured || other.health < 65).length / 2,
    workers('wood'), workers('food'), workers('fire'), workers('help'),
    ...ACTIONS.map((action) => Number(npc.command === action)),
    Number(state.priority === 'wood'), Number(state.priority === 'food'),
    distance(npc.position, LOCATIONS.camp) / 100, npc.inventory.wood / 6, npc.inventory.food / 4,
    weather.stormRisk, weather.wetness / 100, weather.exposure,
    weather.shelterIntegrity / 100, weather.shelterDistance / 100,
  ];
  return {
    features: raw.map((value) => clamp(value, 0, 1)), allowed: getAllowedActions(state, npc), npcId: npc.id,
    context: {
      weather: { ...weather },
      self: { position: { ...npc.position }, health: npc.health, energy: npc.energy, hunger: npc.hunger, fear: npc.fear },
      resources: { wood: state.wood, food: state.food, fire: state.fire },
      allies: others.map(other => ({ id: other.id, position: { ...other.position }, health: other.health, action: other.action })),
    },
  };
}
