import type { VillageState } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { combatEntity, fenceBlocksSegment } from './targeting';
import { combatRandom, damageForHit, resolveAttack } from './combat';
import { advanceWaveSchedule } from './waves';
import { applyFenceDamage } from './fence';
import { settleDeathLoot } from './loot';
import { advanceRecovery } from './recovery';
import { chooseMonsterIntent } from '../ai/monster-policy';
import { moveTowards } from './combat-actions';
import { distance } from './resources';
import { routeDistance } from './navigation';
import { repairWorldPosition } from '../../world/navigation';
export function advanceCombat(state: VillageState, dt: number) {
  if (!state.combat) return;
  advanceWaveSchedule(state); const geometry = state.combat.fenceGeometry;
  for (const enemy of Object.values(state.combat.enemies)) {
    if (enemy.hp <= 0) { if (enemy.deathEventId) settleDeathLoot(state, enemy.deathEventId); continue; }
    const intent = chooseMonsterIntent(state, enemy.id); if (!intent) continue;
    const a = combatEntity(state, enemy.id)!, target = combatEntity(state, intent.targetId)!;
    if (geometry.kind === 'shared-world') {
      const hit = resolveAttack(state, intent); if (hit.applied || hit.reason === 'cooldown') continue;
      const route = routeDistance(state, enemy.position, target.position);
      if (Number.isFinite(route)) { moveTowards(state, enemy.position, target.position, a.stats.moveSpeed * 4, dt); continue; }
      const gate = geometry.gatePosition!;
      if (state.economy!.fence.hp > 0 && state.combat.gateOpen !== true && distance(enemy.position, gate) <= 5) {
        if ((state.combat.cooldowns[enemy.id] ?? 0) <= state.elapsed + 1e-8) {
          const rules = selectWorldRules('village-v1', state.ruleVersion), fence = rules.tables.fences.find(f => f.level === state.economy!.fence.level)!;
          const landed = combatRandom(state) < Math.max(.05, Math.min(.98, a.stats.hitRate));
          applyFenceDamage(state, landed ? damageForHit(a.stats.attack, fence.defense, false, a.stats.critMultiplier) : 0, `${enemy.id}:${state.tick}`);state.combat.cooldowns[enemy.id]=state.elapsed+1/a.stats.attackSpeed;
        }
      } else {
        const gap=Math.max(.1,distance(enemy.position,gate));const approach=repairWorldPosition({x:gate.x+(enemy.position.x-gate.x)/gap*4,y:gate.y+(enemy.position.y-gate.y)/gap*4},state.seed,false);
        moveTowards(state,enemy.position,approach,a.stats.moveSpeed*4,dt);
      }
      continue;
    }
    if (fenceBlocksSegment(state, enemy.position, target.position)) {
      const radial = distance(enemy.position, geometry.center);
      if (radial - geometry.radius > 1.5) {
        const scale = (geometry.radius + 1) / Math.max(radial, 1e-9);
        moveTowards(state, enemy.position, { x: geometry.center.x + (enemy.position.x - geometry.center.x) * scale, y: geometry.center.y + (enemy.position.y - geometry.center.y) * scale }, a.stats.moveSpeed * 4, dt);
      } else if ((state.combat.cooldowns[enemy.id] ?? 0) <= state.elapsed + 1e-8) {
        const rules = selectWorldRules('village-v1', state.ruleVersion), fence = rules.tables.fences.find(f => f.level === state.economy!.fence.level)!;
        const hit = combatRandom(state) < Math.max(.05, Math.min(.98, a.stats.hitRate)), critical = hit && combatRandom(state) < a.stats.critRate;
        applyFenceDamage(state, hit ? damageForHit(a.stats.attack, fence.defense, critical, a.stats.critMultiplier) : 0, `${enemy.id}:${state.tick}`);
        state.combat.cooldowns[enemy.id] = state.elapsed + 1 / a.stats.attackSpeed;
      }
    } else if (distance(enemy.position, target.position) > a.stats.range) moveTowards(state, enemy.position, target.position, a.stats.moveSpeed * 4, dt);
    else resolveAttack(state, intent);
  }
  advanceRecovery(state);
}
