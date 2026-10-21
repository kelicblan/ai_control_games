import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState, Point } from '../domain/types';
import { repairWorldPosition } from '../../world/navigation';
import { selectWorldRules } from '../config/load';
import { distance, supplement } from './resources';
import { routeDistance } from './navigation';
import { moveTowards } from './combat-actions';
import { fenceBlocksSegment } from './targeting';

/** A separately versioned additive campaign feature; legacy rule fixtures remain reproducible. */
export const WORKSHOP_RULES = { version: 1, cost: { wood: 12, stone: 4, rope: 2 }, workSeconds: 20, interactionRadius: 1.5 } as const;
export function initializeWorkshop(state: VillageState, legacy = false) {
  ensure(state.economy, 'Missing economy'); if (state.economy.workshop) return false;
  const store = state.economy.storePosition;
  const proposed = { x: store.x + 7, y: store.y + 6 };
  state.economy.workshop = { version: 1, position: state.navigation ? repairWorldPosition(proposed, state.seed) : proposed,
    buildExecutionId: null, completedEventId: null,
    legacyExecutions: legacy ? Object.values(state.executions).filter(e => e.command.action === 'CRAFT' && ['accepted', 'running'].includes(e.status)).map(e => e.id) : [] };
  return true;
}
export function workshopTarget(state: VillageState) { return state.economy?.workshop?.position ?? state.economy!.storePosition; }
export function workshopTravel(state: VillageState, actorId: string, point: Point) {
  const actor = state.actors[actorId];
  const speed = supplement<{ baseMoveSpeed: number }>(selectWorldRules('village-v1', state.ruleVersion), 'D17').baseMoveSpeed * actor.attributes.moveSpeed;
  const route = state.navigation ? routeDistance(state, actor.position, point) : fenceBlocksSegment(state, actor.position, point) ? Infinity : distance(actor.position, point);
  ensure(speed > 0 && Number.isFinite(route), '工坊或接收人无法到达，请检查寨门与路线'); return route / speed;
}
export function approachWorkstation(state: VillageState, actorId: string, point: Point, dt: number) {
  if (distance(state.actors[actorId].position, point) <= WORKSHOP_RULES.interactionRadius && !fenceBlocksSegment(state, state.actors[actorId].position, point)) return;
  const speed = supplement<{ baseMoveSpeed: number }>(selectWorldRules('village-v1', state.ruleVersion), 'D17').baseMoveSpeed * state.actors[actorId].attributes.moveSpeed;
  ensure(moveTowards(state, state.actors[actorId].position, point, speed, dt), '前往工坊或交付的路线受阻');
}
export const WORKSHOP_CAPABILITY: ActionCapability<VillageState> = {
  id: 'BUILD_WORKSHOP', validate(state, c) {
    const w = state.economy?.workshop;
    ensure(w && !w.completedEventId && c.actorId === state.playerId && Object.keys(c.parameters).length === 0, '工坊已建成或当前不可建造');
    ensure(!w.buildExecutionId || !['accepted', 'running'].includes(state.executions[w.buildExecutionId]?.status), '工坊正在建设');
    ensure(state.actors[c.actorId].attributes.craft > 0, '不具备建设能力');
    w.buildExecutionId = `${state.worldId}:ex${state.nextExecution}`;
    return { duration: workshopTravel(state, c.actorId, w.position) + WORKSHOP_RULES.workSeconds, cost: { ...WORKSHOP_RULES.cost } };
  }, advance(state, e, dt) { approachWorkstation(state, e.command.actorId, workshopTarget(state), dt); },
  complete(state, e) {
    const w = state.economy!.workshop!;
    ensure(!w.completedEventId && distance(state.actors[e.command.actorId].position, w.position) <= WORKSHOP_RULES.interactionRadius && !fenceBlocksSegment(state, state.actors[e.command.actorId].position, w.position), '尚未到达工坊工位');
    const event = appendEvent(state, 'workshop.built', [e.command.actorId], { position: { ...w.position }, version: WORKSHOP_RULES.version }, e.id);
    w.completedEventId = event.id; state.versions['inventory:public']++;
  },
};
export function workshopView(state: VillageState) {
  const w = state.economy?.workshop; if (!w) return null;
  const task = w.buildExecutionId ? state.executions[w.buildExecutionId] : null;
  return { ...w, ...WORKSHOP_RULES, state: w.completedEventId ? 'ready' : task && ['accepted', 'running'].includes(task.status) ? 'building' : 'planned', remaining: task && ['accepted', 'running'].includes(task.status) ? task.remaining : 0 };
}
