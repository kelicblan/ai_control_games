import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { distance } from './resources';
export const GATE_CAPABILITY: ActionCapability<VillageState> = {
  id: 'BUILD_FENCE', validate(state, command) {
    ensure(state.combat?.fenceGeometry.kind === 'shared-world' && state.combat.fenceGeometry.gatePosition && state.economy!.fence.hp > 0 && Object.keys(command.parameters).length === 1 && typeof command.parameters.gateOpen === 'boolean' && distance(state.actors[command.actorId].position, state.combat.fenceGeometry.gatePosition) <= 5, 'Gate operation requires a nearby actor and intact fence');
    return { duration: 1, cost: {} };
  }, complete(state, execution) {
    ensure(state.economy!.fence.hp > 0 && distance(state.actors[execution.command.actorId].position, state.combat!.fenceGeometry.gatePosition!) <= 5, 'Gate conditions changed');
    state.combat!.gateOpen = execution.command.parameters.gateOpen === true; state.combat!.navigationRevision++;
    appendEvent(state, 'gate.changed', Object.keys(state.actors), { open: state.combat!.gateOpen, actorId: execution.command.actorId, navigationRevision: state.combat!.navigationRevision }, execution.id);
  },
};
