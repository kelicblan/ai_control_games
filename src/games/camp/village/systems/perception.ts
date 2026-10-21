import {animalHostile} from '../../animals/tide';
import {fenceBlocksSegment} from './targeting';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { digest } from '../../../../../packages/action-runtime/src/json';
import { observePersonalEvent } from '../../../../../packages/social-core/src/knowledge';
import type { Json } from '../../../../../packages/action-runtime/src/types';
import type { VillageState } from '../domain/types';
import { distance } from './resources';
import { selectWorldRules } from '../config/load';
/** Only local, physically observed entities enter each person's knowledge. */
export function refreshKnowledge(state: VillageState) {
  if (!state.economy) return;
  for (const actor of Object.values(state.actors)) {
    const see = (entityId: string, entityKind: string, entityVersion: number, entityValues: Record<string, Json>) => {
      const previous = actor.personal.knowledge.entities[entityId];
      if (previous && previous.version === entityVersion && digest(previous.values) === digest(entityValues)) return;
      const event = appendEvent(state, 'entity.observed', [actor.id], { entityId, entityKind, entityVersion, entityValues });
      actor.personal.knowledge = observePersonalEvent(actor.id, event, actor.personal.knowledge);
    };
    for (const node of Object.values(state.economy.nodes)) if (distance(actor.position, node.position) <= 12) see(node.id, 'resource-node', state.versions[`node:${node.id}`], { resource: node.resource, remainingHp: node.remainingHp, position: { ...node.position }, level: node.level });
    for (const site of Object.values(state.economy.foodSources ?? {})) if(distance(actor.position,site.position)<=12)see(site.id,'food-source',site.refilledInterval*site.capacity+site.capacity-site.remaining,{remaining:site.remaining,position:{...site.position}});
    const workshop = state.economy.workshop;
    if (workshop && distance(actor.position, workshop.position) <= 12 && !fenceBlocksSegment(state, actor.position, workshop.position)) see('workshop:public', 'workshop', workshop.completedEventId ? 1 : 0, { ready: workshop.completedEventId ? 1 : 0, position: { ...workshop.position } });
    if (distance(actor.position, state.economy.storePosition) <= 2) {
      const values: Record<string, number> = { store_information_confidence: 1 };
      for (const resource of ['wood', 'stone', 'rope', 'food']) { const reserved = Object.values(state.reservations).reduce((n, r) => n + (r[resource] ?? 0), 0); values[`known_free_${resource}_log`] = (state.inventory[resource] ?? 0) - reserved; values[`known_reserved_${resource}_log`] = reserved; }
      values.known_population_ratio = Object.keys(state.actors).length - 1;
      if(state.combat)values.unlocked_wpn006=+state.combat.unlockedRecipes.includes('WPN006');
      see('inventory:public', 'store', state.versions['inventory:public'], values);
    }
    for (const container of Object.values(state.economy.containers)) if (distance(actor.position, container.position) <= 12) see(container.id, 'resource-container', Math.floor(Object.values(container.resources).reduce((a, b) => a + b, 0)), { position: { ...container.position }, quantity: Object.values(container.resources).reduce((a, b) => a + b, 0) });
    if (state.combat) {
      const quantize = (p: { x: number; y: number }) => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 });
      for (const enemy of Object.values(state.combat.enemies)) if (distance(actor.position, enemy.position) <= 12) see(enemy.id, 'enemy', state.versions[`enemy:${enemy.id}`] ?? 0, { hp: enemy.hp, position: quantize(enemy.position), archetypeId: enemy.archetypeId });
      for(const a of state.wildlife?.ecology.animals??[])if(distance(actor.position,a.position)<=12&&!fenceBlocksSegment(state,actor.position,a.position))see(a.id,animalHostile(state.wildlife!.ecology,a,actor.id)?'enemy':'wildlife',Math.floor(state.elapsed),{hp:a.hp,position:quantize(a.position),species:a.species,carcass:a.carcass});
      for (const ally of Object.values(state.actors)) if (ally.id !== actor.id && distance(actor.position, ally.position) <= 12) see(ally.id, 'ally', state.versions[`actor:${ally.id}`], { hp: ally.body.hp, maxHp: ally.body.maxHp, downed: ally.body.downed, position: quantize(ally.position) });
      if (distance(actor.position, state.combat.fenceGeometry.center) <= state.combat.fenceGeometry.radius + 12) see('fence:public', 'fence', state.versions['fence:public'] ?? 0, { hp: state.economy.fence.hp, level: state.economy.fence.level, known_fence_hp_ratio: state.economy.fence.hp / selectWorldRules('village-v1',state.ruleVersion).tables.fences.find(f=>f.level===state.economy!.fence.level)!.hp });
    }
  }
}
