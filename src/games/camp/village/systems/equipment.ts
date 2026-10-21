import { digest, ensure } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { distance } from './resources';
import { authorizeResourceUse } from '../../../../../packages/social-core/src/institutions';
export interface ItemGrant { operationId: string; actorId: string; recipientId: string; itemId: string; agreementId?: string }
export function handoverItem(state: VillageState, grant: ItemGrant) {
  const economy = state.economy; ensure(economy && validId(grant.operationId), 'Invalid item transfer');
  const hash = digest(grant), old = economy.transfers[grant.operationId]; if (old) { ensure(hash === old.digest, 'Transfer operation conflict'); return { accepted: old.accepted }; }
  const item = economy.items[grant.itemId], from = state.actors[grant.actorId], to = state.actors[grant.recipientId];
  ensure(item && from && to && item.holderId === from.id && item.ownerId === from.id && item.equippedBy === null && distance(from.position, to.position) <= 2, 'Item is not available for handover');
  item.ownerId = to.id; item.holderId = to.id;
  appendEvent(state, 'item.handed_over', [from.id, to.id], { itemId: item.id, recipeId: item.recipeId, fromId: from.id, recipientId: to.id, ownershipGranted: true, agreementId: grant.agreementId ?? null });
  state.versions[`actor:${from.id}`]++; state.versions[`actor:${to.id}`]++;
  economy.transfers[grant.operationId] = { digest: hash, accepted: true }; return { accepted: true };
}
export function equipItem(state: VillageState, actorId: string, itemId: string) {
  const actor = state.actors[actorId], item = state.economy?.items[itemId]; ensure(actor && item && (item.ownerId === actorId || authorizeResourceUse(state.institutions ?? {}, actorId, itemId, state.elapsed).allowed) && item.holderId === actorId && (item.equippedBy === null || item.equippedBy === actorId), 'Equipment rights mismatch');
  if (actor.equipment) state.economy!.items[actor.equipment].equippedBy = null;
  actor.equipment = itemId; item.equippedBy = actorId; state.versions[`actor:${actorId}`]++;
  appendEvent(state,'equipment.equipped',[actorId],{itemId,recipeId:item.recipeId,ownerId:item.ownerId});
}
