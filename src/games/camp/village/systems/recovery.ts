import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { distance, supplement } from './resources';
import { moveTowards } from './combat-actions';
import { professionMultiplier } from './profession';
export const RECOVERY_CAPABILITIES: ActionCapability<VillageState>[] = ['HEAL', 'RESCUE', 'REPAIR_FENCE'].map<ActionCapability<VillageState>>(id => ({
  id, validate(state, command): { duration: number; cost: Record<string, number> } {
    const rules = selectWorldRules('village-v1', state.ruleVersion), actor = state.actors[command.actorId];
    ensure(state.economy && rules.capabilities.recovery.configured && Object.keys(command.parameters).length === 0, 'Recovery not configured');
    if (id === 'REPAIR_FENCE') {
      ensure(!Object.values(state.executions).some(e=>['REPAIR_FENCE','UPGRADE_FENCE'].includes(e.command.action)&&['accepted','running'].includes(e.status)),'Fence work station is occupied');
      ensure(distance(actor.position, state.economy.storePosition) <= 2, 'Repair requires village workstation');
      const fence = rules.tables.fences.find(f => f.level === state.economy!.fence.level)!;
      ensure(state.economy.fence.hp < fence.hp, 'Fence already full');
      return { duration: supplement<{ repairWorkSeconds: number }>(rules, 'D10').repairWorkSeconds/professionMultiplier(rules,actor,'repairMultiplier'), cost: { ...fence.repairCost } };
    }
    const target = command.targetId && state.actors[command.targetId];
    ensure(target && distance(actor.position, target.position) <= 2, 'Recovery target not nearby');
    if (id === 'RESCUE') {
      ensure(state.combat && target.body.downed && distance(target.position, state.economy.storePosition) > 2 && !state.combat.carriedBy[target.id] && !Object.values(state.combat.carriedBy).includes(actor.id), 'Rescue unavailable');
      return { duration: Math.max(.1, distance(actor.position, state.economy.storePosition) / 2), cost: {} };
    }
    ensure(target.body.hp < target.body.maxHp, 'No injury');
    return { duration: 5, cost: { food: supplement<{ healFoodCost: number }>(rules, 'D16').healFoodCost } };
  },
  advance(state, execution, dt) {
    if (id !== 'RESCUE') return;
    const target = state.actors[execution.command.targetId!], actor = state.actors[execution.command.actorId];
    ensure(target.body.downed && state.combat && state.economy, 'Rescue target changed');
    ensure(!state.combat.carriedBy[target.id] || state.combat.carriedBy[target.id] === actor.id, 'Another carrier owns casualty');
    state.combat.carriedBy[target.id] = actor.id;
    const store = state.economy.storePosition;
    if(distance(actor.position,store)>1.5)ensure(moveTowards(state, actor.position, store, 2, dt), 'Rescue route blocked');
    target.position = { ...actor.position };
  },
  complete(state, execution) {
    const rules = selectWorldRules('village-v1', state.ruleVersion), actorId = execution.command.actorId, targetId = execution.command.targetId;
    if (id === 'REPAIR_FENCE') {
      const fence = state.economy!.fence, old = fence.hp, maximum = rules.tables.fences.find(f => f.level === fence.level)!.hp;
      fence.hp = Math.min(maximum, old + supplement<{ repairHpPerJob: number }>(rules, 'D10').repairHpPerJob);
      if (old === 0 && fence.hp > 0) state.combat!.navigationRevision++;
      state.versions['fence:public']=(state.versions['fence:public']??0)+1;
      appendEvent(state, 'fence.repaired', [actorId], { beforeHp: old, afterHp: fence.hp }, execution.id);
    } else if (id === 'HEAL') {
      const target = state.actors[targetId!], old = target.body.hp;
      ensure(distance(state.actors[actorId].position, target.position) <= 2, 'Patient moved away');
      target.body.hp = Math.min(target.body.maxHp, old + supplement<{ healHp: number }>(rules, 'D16').healHp);
      target.body.downed = false; target.body.incapacitated = false;
      if (state.combat) delete state.combat.downedAt[target.id];
      state.versions[`actor:${target.id}`]++;
      appendEvent(state, 'actor.healed', [actorId, target.id], { beforeHp: old, afterHp: target.body.hp }, execution.id);
    } else {
      const target = state.actors[targetId!]; ensure(distance(target.position, state.economy!.storePosition) <= 2, 'Rescue not at shelter');
      delete state.combat!.carriedBy[target.id];
      appendEvent(state, 'actor.rescued', [actorId, target.id], { recipientId: target.id, carrierId: actorId, atShelter: true }, execution.id);
    }
  },
}));
export function advanceRecovery(state: VillageState) {
  if (!state.combat) return;
  const rules = selectWorldRules('village-v1', state.ruleVersion), timeout = supplement<{ downedSeconds: number }>(rules, 'D16').downedSeconds;
  for (const [id, at] of Object.entries(state.combat.downedAt)) if (state.elapsed - at >= timeout && !state.actors[id].body.incapacitated) {
    state.actors[id].body.incapacitated = true; state.versions[`actor:${id}`]++;
    appendEvent(state, 'actor.incapacitated', [id], { downedAt: at, reason: 'unrecovered-injury' });
  }
  // A cancelled/failed carrier relinquishes the body at its actual position.
  for (const [targetId, actorId] of Object.entries(state.combat.carriedBy)) if (!Object.values(state.executions).some(e => e.command.actorId === actorId && e.command.targetId === targetId && e.command.action === 'RESCUE' && ['accepted', 'running'].includes(e.status))) delete state.combat.carriedBy[targetId];
}
