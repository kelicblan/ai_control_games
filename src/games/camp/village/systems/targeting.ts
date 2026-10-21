import {SPECIES} from '../../animals/engine';
import type { Point, VillageState } from '../domain/types';
import { deriveStats } from '../domain/stats';
import { selectWorldRules } from '../config/load';
import { distance } from './resources';
import { worldCanTraverse } from '../../world/navigation';
export function combatEntity(state: VillageState, id: string) {
  const rules = selectWorldRules('village-v1', state.ruleVersion), actor = state.actors[id];
  if (actor) {
    const item = actor.equipment ? state.economy?.items[actor.equipment] : undefined;
    const stats = deriveStats(actor.attributes, actor.level, item?.recipeId ?? null, rules);
    return { id, position: actor.position, hp: actor.body.hp, stats, enemy: false };
  }
  const animal=state.wildlife?.ecology.animals.find(a=>a.id===id);
  if(animal){const source=SPECIES[animal.species];return {id,position:animal.position,hp:animal.hp,enemy:true,stats:{...source,range:1.7,moveSpeed:source.speed/4,hitRate:.9,attackSpeed:1/1.2,critRate:0,critMultiplier:1}};}
  const wolf = state.combat?.enemies[id], source = rules.tables.wolves.find(w => w.id === wolf?.archetypeId);
  if (!wolf || !source) return undefined;
  const threat = wolf.threat ?? 1;
  return { id, position: wolf.position, hp: wolf.hp, enemy: true, stats: { ...source, range: 1.5,
    attack: source.attack * (rules.selection.choices.D06.selectedAlternative === 'softened-attack' ? 1 + .25 * (threat - 1) : threat) } };
}
/** Shared logical perimeter. A destroyed fence removes this obstacle for attacks AND movement. */
export function fenceBlocksSegment(state: VillageState, from: Point, to: Point): boolean {
  const geometry = state.combat?.fenceGeometry;
  if (geometry?.kind === 'shared-world') return !worldCanTraverse(from, to, state.seed, state.economy!.fence.hp <= 0 || state.combat!.gateOpen === true);
  if (!geometry || !state.economy || state.economy.fence.hp <= 0) return false;
  const a = { x: from.x - geometry.center.x, y: from.y - geometry.center.y }, b = { x: to.x - geometry.center.x, y: to.y - geometry.center.y };
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  if (!length) return false;
  const aInside = Math.hypot(a.x, a.y) < geometry.radius, bInside = Math.hypot(b.x, b.y) < geometry.radius;
  if (aInside !== bInside) return true;
  if (aInside) return false;
  const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length));
  return Math.hypot(a.x + t * dx, a.y + t * dy) < geometry.radius;
}
export function canApplyHit(state: VillageState, attackerId: string, targetId: string): { allowed: boolean; reason?: string } {
  const a = combatEntity(state, attackerId), t = combatEntity(state, targetId);
  if (!a || !t || a.hp <= 0 || t.hp <= 0 || a.enemy === t.enemy) return { allowed: false, reason: 'invalid-target' };
  if (fenceBlocksSegment(state, a.position, t.position)) return { allowed: false, reason: 'fence' };
  if (distance(a.position, t.position) > a.stats.range) return { allowed: false, reason: 'range' };
  return { allowed: true };
}
