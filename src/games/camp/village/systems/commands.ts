import { createActionRuntime, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { ActionCommand } from '../../../../../packages/action-runtime/src/types';
import type { VillageState } from '../domain/types';
import { RESOURCES } from '../domain/state';
import { LIFE_CAPABILITIES } from './life-actions';
import { RECOVERY_CAPABILITIES } from './recovery';
import { COMBAT_CAPABILITIES } from './combat-actions';
import { EXPLORE_CAPABILITY } from './exploration';
import { INSTITUTION_CAPABILITY } from '../social/institution-action';
import { EAT_CAPABILITY } from './eating';
import { GATE_CAPABILITY } from './gate';
import { FOOD_GATHER_CAPABILITY } from './food-supply';
import { CHANGE_CAPABILITY } from '../social/change-action';
import { COMPANION_CAPABILITIES } from './companionship';
import { WORKSHOP_CAPABILITY } from './workshop';
import { DELIVERY_CAPABILITY } from './delivery';

export function freeResources(state: VillageState, resource: string): number {
  return (state.inventory[resource] ?? 0) - Object.values(state.reservations).reduce((sum, r) => sum + (r[resource] ?? 0), 0);
}
export const WAIT_CAPABILITY: ActionCapability<VillageState> = {
  id: 'WAIT', validate(_state, command) {
    ensure(Object.keys(command.parameters).length === 1 && typeof command.parameters.seconds === 'number' && Number.isFinite(command.parameters.seconds), 'WAIT requires explicit seconds');
    return { duration: command.parameters.seconds, cost: {} };
  }, complete() {},
};
export function villageActions(capabilities: readonly ActionCapability<VillageState>[] = [WAIT_CAPABILITY, WORKSHOP_CAPABILITY, DELIVERY_CAPABILITY, ...LIFE_CAPABILITIES, ...RECOVERY_CAPABILITIES, ...COMBAT_CAPABILITIES, EXPLORE_CAPABILITY, INSTITUTION_CAPABILITY, EAT_CAPABILITY, GATE_CAPABILITY, FOOD_GATHER_CAPABILITY, CHANGE_CAPABILITY,...COMPANION_CAPABILITIES]) {
  return createActionRuntime<VillageState>({
    validate(state) {
      ensure(Object.entries(state.inventory).every(([key, n]) => RESOURCES.includes(key) && Number.isSafeInteger(n) && n >= 0 && freeResources(state, key) >= 0), 'Invalid resource effect');
      for (const actor of Object.values(state.actors)) {
        ensure(Number.isFinite(actor.body.hp) && actor.body.hp >= 0 && actor.body.hp <= actor.body.maxHp, 'Invalid HP effect');
        ensure(Object.values(actor.carried).every(n => Number.isSafeInteger(n) && n >= 0), 'Invalid carried effect');
        for (const key of ['hunger', 'energy', 'morale', 'fear', 'wetness'] as const) ensure(Number.isFinite(actor.body[key]) && actor.body[key] >= 0 && actor.body[key] <= 100, 'Invalid body effect');
      }
    },
    available(state, actorId) { const actor = state.actors[actorId]; return !!actor && actor.body.hp > 0 && !actor.body.downed && !actor.body.incapacitated; },
    reserve(state, id, cost) {
      for (const [resource, amount] of Object.entries(cost)) ensure(RESOURCES.includes(resource) && freeResources(state, resource) >= amount, 'Insufficient unreserved resources');
      state.reservations[id] = { ...cost };
      if (Object.values(cost).some(n => n > 0)) state.versions['inventory:public']++;
    },
    settle(state, id, consume) {
      const cost = state.reservations[id]; ensure(cost, 'Reservation missing');
      if (consume) for (const [resource, amount] of Object.entries(cost)) { ensure((state.inventory[resource] ?? 0) >= amount, 'Reservation cannot settle'); state.inventory[resource] = (state.inventory[resource] ?? 0) - amount; }
      delete state.reservations[id]; if (Object.values(cost).some(n => n > 0)) state.versions['inventory:public']++;
    },
  }, capabilities);
}
const runtime = villageActions();
export const submitCommand = (state: VillageState, command: ActionCommand) => {
  if(!state.operations[command.operationId]&&command.issuedAtTick!==undefined&&(command.issuedAtTick>state.tick||state.history&&command.issuedAtTick<=state.history.retiredBeforeTick))return{accepted:false,operationId:command.operationId,reason:'Command timestamp retired or in the future'};
  return runtime.submit(state, command);
};
export const cancelExecution = runtime.cancel;
export const advanceExecutions = runtime.advance;
