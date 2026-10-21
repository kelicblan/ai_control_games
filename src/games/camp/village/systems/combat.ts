import {hurtAnimal} from '../../animals/engine';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState } from '../domain/types';
import { combatEntity, canApplyHit } from './targeting';
export interface AttackIntent { attackerId: string; targetId: string }
export interface AttackResult { applied: boolean; damage: number; hit: boolean; critical: boolean; eventId?: string; reason?: string }
export function initializeCombat(state: VillageState, geometry: NonNullable<VillageState['combat']>['fenceGeometry']) {
  ensure(!state.combat && state.economy && [geometry.center.x, geometry.center.y, geometry.radius].every(Number.isFinite) && geometry.radius > 0, 'Invalid combat initialization');
  state.combat = { version: 1, enemies: {}, cooldowns: {}, fenceGeometry: structuredClone(geometry), navigationRevision: 0, waves: {}, loot: {}, unlockedRecipes: [], downedAt: {}, carriedBy: {}, randomCounter: 0 };
}
export function damageForHit(attack: number, defense: number, critical: boolean, multiplier: number) {
  ensure([attack, defense, multiplier].every(Number.isFinite) && attack >= 0 && defense >= 0 && multiplier >= 1, 'Invalid combat stats');
  return Math.max(1, Math.floor(attack * (critical ? multiplier : 1) * (1 - Math.min(.7, defense / (defense + 50)))));
}
/** Counter based RNG is persisted; replay never depends on render or wall-clock order. */
export function combatRandom(state: VillageState): number {
  ensure(state.combat, 'Combat not initialized');
  let n = (state.seed ^ Math.imul(++state.combat.randomCounter, 0x9e3779b9)) >>> 0;
  n ^= n >>> 16; n = Math.imul(n, 0x21f0aaad); n ^= n >>> 15; n = Math.imul(n, 0x735a2d97); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
export function resolveAttack(state: VillageState, intent: AttackIntent, rng = () => combatRandom(state)): AttackResult {
  ensure(state.combat, 'Combat not initialized');
  const check = canApplyHit(state, intent.attackerId, intent.targetId);
  if (!check.allowed) return { applied: false, damage: 0, hit: false, critical: false, reason: check.reason };
  if ((state.combat.cooldowns[intent.attackerId] ?? 0) > state.elapsed + 1e-8) return { applied: false, damage: 0, hit: false, critical: false, reason: 'cooldown' };
  const a = combatEntity(state, intent.attackerId)!, target = combatEntity(state, intent.targetId)!;
  const roll = rng(); ensure(Number.isFinite(roll) && roll >= 0 && roll < 1, 'Invalid hit roll');
  const hit = roll < Math.max(.05, Math.min(.98, a.stats.hitRate));
  const criticalRoll = hit ? rng() : 1; ensure(Number.isFinite(criticalRoll) && criticalRoll >= 0 && criticalRoll <= 1, 'Invalid critical roll');
  const critical = hit && criticalRoll < a.stats.critRate;
  const damage = hit ? damageForHit(a.stats.attack, target.stats.defense, critical, a.stats.critMultiplier) : 0;
  state.combat.cooldowns[a.id] = state.elapsed + 1 / a.stats.attackSpeed;
  const remaining = Math.max(0, target.hp - damage);
  const animal=state.wildlife?.ecology.animals.find(a=>a.id===target.id);
  if(animal)hurtAnimal(state.wildlife!.ecology,animal,damage,a.id);
  else if (target.enemy) state.combat.enemies[target.id].hp = remaining;
  else { const body = state.actors[target.id].body; body.hp = remaining; if (remaining === 0) { body.downed = true; state.combat.downedAt[target.id] ??= state.elapsed; } }
  state.versions[`${target.enemy ? 'enemy' : 'actor'}:${target.id}`] = (state.versions[`${target.enemy ? 'enemy' : 'actor'}:${target.id}`] ?? 0) + 1;
  const event = appendEvent(state, 'combat.attack', [a.id, target.id], { attackerId: a.id, targetId: target.id, hit, critical, damage, remainingHp: remaining, source: 'entity-attack' });
  event.visibleTo = Object.values(state.actors).filter(actor => Math.hypot(actor.position.x - target.position.x, actor.position.y - target.position.y) <= 12).map(actor => actor.id);
  if (!remaining && target.enemy && !animal && !state.combat.enemies[target.id].deathEventId) {
    const death = appendEvent(state, 'enemy.died', [a.id], { enemyId: target.id, archetypeId: state.combat.enemies[target.id].archetypeId, attackEventId: event.id });
    state.combat.enemies[target.id].deathEventId = death.id;
  }
  return { applied: true, damage, hit, critical, eventId: event.id };
}
