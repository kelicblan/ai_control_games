import { authorizeResourceUse } from '../../../../../packages/social-core/src/institutions';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { distance } from '../systems/resources';
export function lendItem(state: VillageState, ownerId: string, recipientId: string, itemId: string, executionId: string) {
  const item = state.economy?.items[itemId], owner = state.actors[ownerId], recipient = state.actors[recipientId];
  ensure(item && owner && recipient && item.ownerId === ownerId && item.holderId === ownerId && item.equippedBy === null && distance(owner.position, recipient.position) <= 2, 'Loan physical conditions failed');
  const right = authorizeResourceUse(state.institutions ?? {}, recipientId, itemId, state.elapsed); ensure(right.allowed, 'Borrower lacks current use right');
  item.holderId = recipientId;
  state.versions[`actor:${ownerId}`]++; state.versions[`actor:${recipientId}`]++;
  appendEvent(state, 'item.lent', [ownerId, recipientId], { itemId, ownerId, recipientId, ownershipGranted: false, ruleVersion: right.ruleVersion, basisRefs: right.basisRefs }, executionId);
}
export function expireUseRights(state: VillageState) {
  if (!state.economy || !state.institutions) return;
  for (const item of Object.values(state.economy.items)) if (item.equippedBy && item.equippedBy !== item.ownerId && !authorizeResourceUse(state.institutions, item.equippedBy, item.id, state.elapsed).allowed) {
    const actor = state.actors[item.equippedBy]; actor.equipment = null; item.equippedBy = null; state.versions[`actor:${actor.id}`]++;
    appendEvent(state, 'item.use_right_expired', [actor.id, item.ownerId], { itemId: item.id, ownerId: item.ownerId, holderId: item.holderId });
  }
}
export function returnLoan(state:VillageState,holderId:string,ownerId:string,itemId:string,executionId:string){
 const item=state.economy?.items[itemId],holder=state.actors[holderId],owner=state.actors[ownerId];
 ensure(item&&holder&&owner&&item.ownerId===ownerId&&item.holderId===holderId&&item.equippedBy===null&&distance(holder.position,owner.position)<=2,'Return physical conditions failed');
 item.holderId=ownerId;state.versions[`actor:${holderId}`]++;state.versions[`actor:${ownerId}`]++;
 appendEvent(state,'item.returned',[holderId,ownerId],{itemId,holderId,ownerId,ownershipGranted:false},executionId);
}
