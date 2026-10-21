import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { distance } from './resources';
export const EAT_CAPABILITY: ActionCapability<VillageState> = {
  id: 'EAT', validate(state, command) {
    ensure(state.economy && state.ruleVersion === 'p4-social-content-v1' && Object.keys(command.parameters).length === 0 && distance(state.actors[command.actorId].position, state.economy.storePosition) <= 2 && state.actors[command.actorId].body.hunger > 0, 'Eating requires food at the store and hunger');
    return { duration: 2, cost: { food: 1 } };
  }, complete(state, execution) {
    const actor = state.actors[execution.command.actorId], before = actor.body.hunger;
    actor.body.hunger = Math.max(0, before - 20);
    appendEvent(state, 'actor.ate', [actor.id], { food: 1, beforeHunger: before, afterHunger: actor.body.hunger }, execution.id);
  },
};
