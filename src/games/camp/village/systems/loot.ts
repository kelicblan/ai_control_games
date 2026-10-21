import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { selectWorldRules } from '../config/load';
import type { VillageState } from '../domain/types';
import { isEliteWolf } from '../config/monster-catalog';
export function settleDeathLoot(state: VillageState, deathEventId: string): string {
  ensure(state.combat && state.economy, 'Loot unavailable');
  if (state.combat.loot[deathEventId]) return state.combat.loot[deathEventId];
  const event = state.events.find(e => e.id === deathEventId && e.kind === 'enemy.died');
  const enemy = event && state.combat.enemies[String(event.facts.enemyId)];
  ensure(enemy && enemy.hp === 0 && enemy.deathEventId === deathEventId, 'Death evidence missing');
  const rules = selectWorldRules('village-v1', state.ruleVersion), source = rules.tables.wolves.find(w => w.id === enemy.archetypeId)!;
  const id = `loot:${enemy.id}`;
  ensure(!state.economy.containers[id], 'Loot identity collision');
  state.economy.containers[id] = { id, position: { ...enemy.position }, resources: { ...source.drops }, sourceEventId: deathEventId };
  state.combat.loot[deathEventId] = id; state.versions[`container:${id}`] = 0;
  if (isEliteWolf(enemy.archetypeId) && !state.combat.unlockedRecipes.includes('WPN006')) state.combat.unlockedRecipes.push('WPN006');
  appendEvent(state, 'loot.created', event!.participants, { containerId: id, deathEventId, unlockRecipe: isEliteWolf(enemy.archetypeId) ? 'WPN006' : null });
  return id;
}
