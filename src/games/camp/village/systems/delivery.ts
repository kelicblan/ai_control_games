import { type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState } from '../domain/types';
import { handoverItem } from './equipment';
import { workshopTravel, approachWorkstation } from './workshop';
import { fenceBlocksSegment } from './targeting';

function available(state: VillageState, actorId: string, targetId: string, itemId: string) {
  const item = state.economy?.items[itemId], recipient = state.actors[targetId];
  ensure(item && item.ownerId === actorId && item.holderId === actorId && !item.equippedBy && actorId !== targetId, '只能交付本人持有且已卸下的装备');
  ensure(recipient && recipient.body.hp > 0 && !recipient.body.downed && !recipient.body.incapacitated, '接收人无法领取，请先救援或重新分配');
  return recipient;
}
export const DELIVERY_CAPABILITY: ActionCapability<VillageState> = {
  id: 'DELIVER_ITEM', validate(state, command) {
    ensure(typeof command.targetId === 'string' && typeof command.parameters.itemId === 'string' && Object.keys(command.parameters).length === 1, '请选择装备和接收人');
    const recipient = available(state, command.actorId, command.targetId, command.parameters.itemId);
    return { duration: Math.max(1, workshopTravel(state, command.actorId, recipient.position) + 3), cost: {} };
  }, advance(state, e, dt) {
    const recipient = available(state, e.command.actorId, e.command.targetId!, String(e.command.parameters.itemId));
    approachWorkstation(state, e.command.actorId, recipient.position, dt);
  }, complete(state, e) {
    const recipient = available(state, e.command.actorId, e.command.targetId!, String(e.command.parameters.itemId));
    ensure(!fenceBlocksSegment(state, state.actors[e.command.actorId].position, recipient.position), '交付路线受阻');
    handoverItem(state, { operationId: `delivery:${e.id}`, actorId: e.command.actorId, recipientId: recipient.id, itemId: String(e.command.parameters.itemId) });
  },
};
