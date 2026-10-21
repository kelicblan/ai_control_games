import { ensure, digest } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { CompiledVillageRules } from '../config/schema';
import { selectWorldRules } from '../config/load';
import type { VillageState, Point } from '../domain/types';
import { deriveStats } from '../domain/stats';
import { distance, supplement, addResourceNode } from './resources';
import { moveTowards } from './combat-actions';
import {routeDistance} from './navigation';
export function resourceLevel(campDistance: number, rules: CompiledVillageRules) {
  ensure(Number.isFinite(campDistance) && campDistance >= 0 && rules.capabilities.explore.configured, 'Exploration distance or rules unavailable');
  const rows = supplement<{ distanceLevelRules: { minimumDistance: number; level: number }[] }>(rules, 'D15').distanceLevelRules;
  return rows.filter(r => r.minimumDistance <= campDistance).at(-1)!.level;
}
/** Result is tied to a completed physical expedition, not a speech or refresh request. */
export function completeExploration(state: VillageState, expeditionId: string) {
  const old = state.events.find(e => e.kind === 'exploration.completed' && e.executionId === expeditionId); if (old) return old;
  const execution = state.executions[expeditionId];
  ensure(execution && execution.command.action === 'EXPLORE' && execution.remaining <= 1e-8 && state.economy, 'Expedition not completed');
  const rules = selectWorldRules('village-v1', state.ruleVersion), actor = state.actors[execution.command.actorId], p = execution.command.parameters;
  const target = { x: Number(p.x), y: Number(p.y) }; ensure(distance(actor.position, target) < .1, 'Expedition has not arrived');
  const hash = digest({ seed: state.seed, expeditionId, ruleHash: state.ruleHash });
  const successRoll = parseInt(hash.slice(0, 8), 16) / 4294967296, injuryRoll = parseInt(hash.slice(8, 16), 16) / 4294967296;
  const stats = deriveStats(actor.attributes, actor.level, null, rules), success = successRoll < Math.max(.1, Math.min(.95, .35 + .1 * stats.explore));
  const level = resourceLevel(distance(target, state.economy.storePosition), rules), nodeId = `explored:${Math.round(target.x)}:${Math.round(target.y)}:${String(p.resource)}`;
  if (success && !state.economy.nodes[nodeId]) addResourceNode(state, rules, { id: nodeId, resource: p.resource as 'wood' | 'stone' | 'rope', level, position: target });
  const injury = injuryRoll < rules.tables.globals.EXPLORE_RISK_BASE ? supplement<{ explorationDamage: number }>(rules, 'D15').explorationDamage : 0;
  actor.body.hp = Math.max(0, actor.body.hp - injury);
  if (actor.body.hp === 0) { actor.body.downed = true; if (state.combat) state.combat.downedAt[actor.id] ??= state.elapsed; }
  return appendEvent(state, 'exploration.completed', [actor.id], { success, injury, level, nodeId: success ? nodeId : null, position: target, source: 'exploration-risk' }, expeditionId);
}
export const EXPLORE_CAPABILITY: ActionCapability<VillageState> = {
  id: 'EXPLORE', validate(state, command) {
    const rules = selectWorldRules('village-v1', state.ruleVersion), p = command.parameters;
    ensure(rules.capabilities.explore.configured && state.economy && Object.keys(p).length === 3 && ['wood', 'stone', 'rope'].includes(String(p.resource)) && typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y), 'Invalid expedition');
    const d = distance(state.actors[command.actorId].position, p as unknown as Point); ensure(d <= 1000, 'Expedition range exceeded');
    const travel=state.navigation?routeDistance(state,state.actors[command.actorId].position,p as unknown as Point):d;ensure(Number.isFinite(travel),'Expedition target unreachable');
    return { duration: Math.max(.1, travel / (4 * state.actors[command.actorId].attributes.moveSpeed)) + supplement<{ explorationEventSeconds: number }>(rules, 'D15').explorationEventSeconds, cost: {} };
  }, advance(state, execution, dt) {
    const actor = state.actors[execution.command.actorId];
    ensure(moveTowards(state, actor.position, execution.command.parameters as unknown as Point, 4 * actor.attributes.moveSpeed, dt), 'Expedition route blocked');
  }, complete(state, execution) { completeExploration(state, execution.id); },
};
