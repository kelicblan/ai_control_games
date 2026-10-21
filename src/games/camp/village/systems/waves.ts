import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import { selectWorldRules } from '../config/load';
import { dueVillageWaves } from '../domain/clock';
import type { VillageState } from '../domain/types';
import { repairWorldPosition } from '../../world/navigation';
export function advanceWaveSchedule(state: VillageState) {
  ensure(state.combat, 'Combat not initialized');
  if(state.wildlife)return [];
  const rules = selectWorldRules('village-v1', state.ruleVersion), events = [];
  for (const due of dueVillageWaves(state.combat.waveEpoch??0, state.elapsed, rules, Object.keys(state.combat.waves).map(Number))) {
    const wave = rules.tables.waves.find(w => w.id === due.waveId)!, center = state.combat.fenceGeometry.center;
    let index = 0;
    for (const [archetypeId, count] of Object.entries(wave.counts)) for (let n = 0; n < count; n++) {
      const id = `wolf:${wave.id}:${index}`, angle = index++ * 2.399963229728653, radius = state.combat.fenceGeometry.radius + 15;
      ensure(!state.combat.enemies[id], 'Wave entity collision');
      const source = rules.tables.wolves.find(w => w.id === archetypeId)!;
      state.combat.enemies[id] = { id, archetypeId, hp: Math.floor(source.hp * wave.threat), threat: wave.threat, position: { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }, nextAttackAt: 0, waveId: String(wave.id), deathEventId: null };
      if (state.navigation) state.combat.enemies[id].position = repairWorldPosition(state.combat.enemies[id].position, state.seed, state.combat.gateOpen === true || state.economy!.fence.hp <= 0);
      state.versions[`enemy:${id}`] = 0;
    }
    const event = appendEvent(state, 'wave.spawned', Object.keys(state.actors), { waveId: wave.id, count: wave.total, scheduledAt: due.atSeconds });
    state.combat.waves[String(wave.id)] = event.id; events.push(event);
  }
  return events;
}
