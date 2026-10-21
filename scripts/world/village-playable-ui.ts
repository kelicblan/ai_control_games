import type { VillageState } from '../../src/games/camp/village/domain/types';
/** Public status follows the newest real delivery; a retried success must clear an old failure. */
export function projectDeliveries(state: VillageState) {
  const tasks = Object.values(state.executions).filter(e => e.command.action === 'DELIVER_ITEM').reverse();
  const rows = tasks.map(task => {
    const itemId = String(task.command.parameters.itemId), recipientId = task.command.targetId!, delivered = state.economy?.items[itemId]?.holderId === recipientId;
    return { itemId, recipientId, state: delivered ? 'delivered' : task.status, reason: delivered ? null : task.reason ?? null };
  });
  for (const order of Object.values(state.economy?.orders ?? {})) if (order.deliveryRequested && order.itemId && !rows.some(r => r.itemId === order.itemId)) {
    const op = order.deliveryOperationId ? state.operations[order.deliveryOperationId] : null, delivered = state.economy!.items[order.itemId]?.holderId === order.recipientId;
    rows.push({ itemId: order.itemId, recipientId: order.recipientId, state: delivered ? 'delivered' : op && !op.receipt.accepted ? 'blocked' : 'waiting', reason: delivered ? null : op?.receipt.reason ?? null });
  }
  return rows;
}
