import { ensure, record } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import type { VillageState } from './types';
import type { CompiledVillageRules } from '../config/schema';
import { isEliteWolf } from '../config/monster-catalog';
export function validateCombat(state: VillageState, rules: CompiledVillageRules) {
  const c = state.combat; if (!c) return;
  ensure(c.waveEpoch===undefined||Number.isFinite(c.waveEpoch)&&c.waveEpoch>=0&&c.waveEpoch<=state.elapsed,'Invalid combat upgrade epoch');
  const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const point = (v: unknown) => record(v) && [v.x, v.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7);
  ensure(record(c) && c.version === 1 && state.economy && ['enemies', 'cooldowns', 'waves', 'loot', 'downedAt', 'carriedBy'].every(k => record(c[k as keyof typeof c])), 'Invalid combat schema');
  ensure(record(c.fenceGeometry) && point(c.fenceGeometry.center) && nonnegative(c.fenceGeometry.radius) && c.fenceGeometry.radius > 0 && Number.isSafeInteger(c.navigationRevision) && c.navigationRevision >= 0 && Number.isSafeInteger(c.randomCounter) && c.randomCounter >= 0, 'Invalid combat geometry or counters');
  ensure(c.fenceGeometry.kind === undefined || c.fenceGeometry.kind === 'shared-world' && point(c.fenceGeometry.gatePosition) && typeof c.gateOpen === 'boolean', 'Invalid shared fence geometry');
  ensure(Object.keys(c.enemies).length <= rules.tables.waves.reduce((n, w) => n + w.total, 0), 'Enemy budget exceeded');
  for (const [id, enemy] of Object.entries(c.enemies)) {
    const source = rules.tables.wolves.find(w => w.id === enemy.archetypeId), wave = rules.tables.waves.find(w => String(w.id) === enemy.waveId);
    ensure(validId(id) && record(enemy) && enemy.id === id && source && wave && enemy.threat === wave.threat && nonnegative(enemy.hp) && enemy.hp <= Math.floor(source.hp * wave.threat) && point(enemy.position) && nonnegative(enemy.nextAttackAt), 'Invalid enemy');
    ensure(enemy.deathEventId === null ? enemy.hp > 0 : enemy.hp === 0 && state.events.some(e => e.id === enemy.deathEventId && e.kind === 'enemy.died' && e.facts.enemyId === id), 'Enemy death evidence mismatch');
  }
  for (const [id, at] of Object.entries(c.cooldowns)) ensure((state.actors[id] || c.enemies[id]) && nonnegative(at), 'Invalid cooldown');
  for (const [waveId, ref] of Object.entries(c.waves)) {
    const wave = rules.tables.waves.find(w => String(w.id) === waveId);
    ensure(wave && state.events.some(e => e.id === ref && e.kind === 'wave.spawned' && e.facts.waveId === wave.id && e.facts.count === wave.total), 'Invalid wave evidence');
    for (const [prototype, count] of Object.entries(wave.counts)) ensure(Object.values(c.enemies).filter(e => e.waveId === waveId && e.archetypeId === prototype).length === count, 'Wave count mismatch');
  }
  for (const [deathId, containerId] of Object.entries(c.loot)) ensure(state.economy!.containers[containerId]?.sourceEventId === deathId && state.events.some(e => e.id === deathId && e.kind === 'enemy.died'), 'Invalid loot ledger');
  ensure(Array.isArray(c.unlockedRecipes) && c.unlockedRecipes.length <= 1 && c.unlockedRecipes.every(id => id === 'WPN006' && Object.values(c.enemies).some(e => isEliteWolf(e.archetypeId) && e.deathEventId && c.loot[e.deathEventId])), 'Invalid recipe unlock');
  for (const [id, at] of Object.entries(c.downedAt)) ensure(state.actors[id]?.body.downed && nonnegative(at) && at <= state.elapsed, 'Invalid downed clock');
  ensure(new Set(Object.values(c.carriedBy)).size === Object.keys(c.carriedBy).length, 'Carrier has multiple casualties');
  for (const [id, carrier] of Object.entries(c.carriedBy)) ensure(state.actors[id]?.body.downed && state.actors[carrier] && id !== carrier, 'Invalid carried casualty');
}
