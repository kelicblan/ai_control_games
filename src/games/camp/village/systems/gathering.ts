import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { selectWorldRules } from '../config/load';
import type { VillageState } from '../domain/types';
import { distance, supplement } from './resources';
export function workNode(state: VillageState, actorId: string, nodeId: string, work: number) {
  const actor = state.actors[actorId], node = state.economy?.nodes[nodeId];
  ensure(actor && node && Number.isFinite(work) && work > 0 && actor.body.hp > 0 && !actor.body.downed && !actor.body.incapacitated && distance(actor.position, node.position) <= 2, 'Node is not workable');
  if (node.remainingHp === 0) return [];
  node.remainingHp = Math.max(0, node.remainingHp - work); state.versions[`node:${nodeId}`]++;
  if (node.remainingHp > 0) return [];
  const event = appendEvent(state, 'node.depleted', [actorId], { nodeId, resource: node.resource, quantity: node.yield }); node.depletedEventId = event.id;
  const capacity = supplement<{ carryCapacity: number }>(selectWorldRules('village-v1', state.ruleVersion), 'D17').carryCapacity;
  const load = Object.values(actor.carried).reduce((a, b) => a + b, 0), carried = Math.min(node.yield, Math.max(0, capacity - load));
  actor.carried[node.resource] = (actor.carried[node.resource] ?? 0) + carried;
  if (node.yield > carried) state.economy!.containers[`drop:${nodeId}`] = { id: `drop:${nodeId}`, position: { ...node.position }, resources: { [node.resource]: node.yield - carried }, sourceEventId: event.id };
  state.versions[`actor:${actorId}`]++; return [event];
}
