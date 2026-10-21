import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState } from '../domain/types';
import { submitCommand } from './commands';
export interface WorkOrderSpec { operationId: string; actorId: string; kind: 'craft' | 'upgradeFence'; recipeId: string; recipientId: string; agreementId?: string }
export function createOrder(state: VillageState, spec: WorkOrderSpec) {
  ensure(state.economy, 'Missing economy');
  return submitCommand(state, { operationId: spec.operationId, actorId: spec.actorId, action: spec.kind === 'craft' ? 'CRAFT' : 'UPGRADE_FENCE',
    parameters: { recipeId: spec.recipeId, recipientId: spec.recipientId, agreementId: spec.agreementId ?? null }, readSet: {}, source: 'scripted_test' });
}
/** Mirrors terminal execution state, never advances a second progress timer. */
export function tickWorkOrders(state: VillageState, _dt: number) {
  if (!state.economy) return [];
  for (const order of Object.values(state.economy.orders)) {
    const status = state.executions[order.executionId]?.status;
    if (order.status === 'working' && status && ['cancelled', 'failed', 'interrupted'].includes(status)) order.status = 'cancelled';
    if (order.status === 'completed' && order.deliveryRequested && !order.deliveryOperationId && order.itemId && order.recipientId !== order.actorId && !Object.values(state.executions).some(e => e.command.actorId === order.actorId && ['accepted', 'running'].includes(e.status))) {
      const item = state.economy.items[order.itemId];
      if (item.ownerId !== order.actorId || item.holderId !== order.actorId || item.equippedBy) continue;
      order.deliveryOperationId = `deliver:${order.id}`;
      submitCommand(state, { operationId: order.deliveryOperationId, actorId: order.actorId, issuedAtTick: state.tick, action: 'DELIVER_ITEM', targetId: order.recipientId, parameters: { itemId: item.id }, readSet: {}, source: 'fallback' });
    }
  }
  return [];
}
