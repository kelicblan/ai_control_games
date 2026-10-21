import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState } from '../domain/types';
/** damage is already resolved against source fence defense by the attacker. */
export function applyFenceDamage(state: VillageState, damage: number, hitId: string) {
  ensure(state.economy && state.combat && Number.isFinite(damage) && damage >= 0 && hitId.length > 0, 'Invalid fence hit');
  if (state.events.some(e => e.kind === 'fence.hit' && e.facts.hitId === hitId)) return [];
  const old = state.economy.fence.hp; state.economy.fence.hp = Math.max(0, old - damage);
  const breached = old > 0 && state.economy.fence.hp === 0;
  if (breached) state.combat.navigationRevision++;
  state.versions['fence:public'] = (state.versions['fence:public'] ?? 0) + 1;
  return [appendEvent(state, 'fence.hit', Object.keys(state.actors), { hitId, damage: old - state.economy.fence.hp, remainingHp: state.economy.fence.hp, breached, navigationRevision: state.combat.navigationRevision })];
}
