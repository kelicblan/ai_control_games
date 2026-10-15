import type { GameState, Npc } from './types';
import { ACTION_DURATIONS, DIFFICULTY_CONFIG, LOCATIONS, MEAL_RELIEF, MOVE_SPEED, distance } from './constants';
import { wildernessSites } from '../world/wildernessSites';
import { threatNear } from '../world/ecology';

const tripCache = new Map<number, number>();
function foodTripSeconds(seed: number): number {
  const prior = tripCache.get(seed);
  if (prior !== undefined) return prior;
  const gate = { x: 50, y: 205 }, exit = { x: 50, y: 300 };
  const legs = wildernessSites(seed).filter(site => site.kind !== 'wood')
    .map(site => distance(LOCATIONS.storage, gate) + 95 + distance(exit, site.stand)).sort((a, b) => a - b);
  const seconds = (legs[Math.min(5, legs.length - 1)] ?? 400) * 2 / (MOVE_SPEED * .8) + ACTION_DURATIONS.food + 20;
  tripCache.set(seed, seconds);
  if (tripCache.size > 4) tripCache.delete(tripCache.keys().next().value!);
  return seconds;
}

/** Real warehouse food is distinct from deliveries and unharvested, committed trips. */
export function foodReserve(state: GameState, excludeId?: string) {
  const living = state.npcs.filter(npc => npc.alive);
  // Reserve enough food for a conservative round trip plus a meal per person.
  const tripSeconds = foodTripSeconds(state.seed);
  const perPerson = Math.max(2, (DIFFICULTY_CONFIG[state.difficulty].hungerRate + .045) * tripSeconds / MEAL_RELIEF + 1);
  const minimum = Math.min(90, Math.ceil(living.length * perPerson));
  const target = Math.min(95, minimum + living.length);
  let incoming = 0, committed = 0;
  for (const npc of living) {
    incoming += npc.inventory.food;
    if (npc.id === excludeId || npc.inventory.food || npc.inventory.wood || !npc.action) continue;
    if (npc.action === 'food' || npc.action === 'explore' && npc.wildTask) {
      if (npc.wildTask?.kind === 'hunt') {
        const animal = state.world?.ecology?.animals.find(animal => animal.id === npc.wildTask?.targetId);
        if (animal && animal.health > 0) committed += 4;
        continue;
      }
      const patch = state.world?.ecology?.resources.find(site => site.id === npc.wildTask?.targetId);
      // A just-assigned action has a provisional batch until startAction chooses its patch.
      // An assigned but missing/depleted target promises no delivery.
      committed += Math.min(4, patch?.remaining ?? (npc.wildTask ? 0 : 4));
    }
  }
  const pendingMeals = Math.min(state.food, living.filter(npc => npc.action === 'eat').length);
  const projected = state.food - pendingMeals + incoming + committed;
  return { minimum, target, incoming, committed, projected, tripSeconds,
    needsGatherer: (state.food - pendingMeals < minimum || incoming > 0 || committed > 0) && projected < target };
}

export function needsFoodGatherer(state: GameState, npc: Npc): boolean {
  return npc.alive && !npc.injured && npc.health > 35 && npc.energy >= 45
    && !npc.inventory.wood && !npc.inventory.food && state.world?.gateOpen !== false
    && !threatNear(state, npc.position)
    && foodReserve(state, npc.id).needsGatherer;
}
