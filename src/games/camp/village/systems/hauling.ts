import { digest, ensure } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { selectWorldRules } from '../config/load';
import type { VillageState } from '../domain/types';
import { distance, supplement } from './resources';
export interface ResourceTransfer { operationId: string; actorId: string; destination: 'store' | 'carried'; containerId?: string }
export function transferResources(state: VillageState, transfer: ResourceTransfer) {
  const economy = state.economy; ensure(economy && validId(transfer.operationId), 'Invalid transfer');
  const hash = digest(transfer), old = economy.transfers[transfer.operationId]; if (old) { ensure(old.digest === hash, 'Transfer operation conflict'); return { accepted: old.accepted, reason: old.reason }; }
  const actor = state.actors[transfer.actorId]; ensure(actor && !actor.body.downed && !actor.body.incapacitated, 'Invalid carrier');
  let accepted = false;
  if (transfer.destination === 'store' && distance(actor.position, economy.storePosition) <= 2 && Object.values(actor.carried).some(n => n > 0)) {
    const quantities = { ...actor.carried };
    for (const [resource, n] of Object.entries(quantities)) state.inventory[resource] = (state.inventory[resource] ?? 0) + n;
    actor.carried = {}; state.versions['inventory:public']++; state.versions[`actor:${actor.id}`]++;
    appendEvent(state, 'resources.deposited', [actor.id], { quantities }); accepted = true;
  } else if (transfer.destination === 'carried' && transfer.containerId) {
    const container = economy.containers[transfer.containerId];
    if (container && distance(actor.position, container.position) <= 2) {
      let capacity = supplement<{ carryCapacity: number }>(selectWorldRules('village-v1', state.ruleVersion), 'D17').carryCapacity - Object.values(actor.carried).reduce((a, b) => a + b, 0);
      const quantities: Record<string, number> = {};
      for (const key of Object.keys(container.resources).sort()) { const count = Math.min(container.resources[key], capacity); actor.carried[key] = (actor.carried[key] ?? 0) + count; container.resources[key] -= count; capacity -= count; if (count > 0) quantities[key] = count; }
      if (Object.keys(quantities).length) { state.versions[`actor:${actor.id}`]++; appendEvent(state, 'resources.picked_up', [actor.id], { containerId: container.id, quantities }); accepted = true; }
    }
  }
  economy.transfers[transfer.operationId] = { digest: hash, accepted }; return { accepted };
}
