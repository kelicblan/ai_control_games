import { ensure } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import type { CompiledVillageRules } from '../config/schema';
import type { VillageState, Point } from '../domain/types';
export function initializeEconomy(state: VillageState, rules: CompiledVillageRules) {
  ensure(state.ruleHash === rules.ruleHash && rules.capabilities.gather.configured && !state.economy, 'Economy rules unavailable or already initialized');
  state.economy = { version: 1, nodes: {}, containers: {}, items: {}, orders: {}, offers: {}, experience: Object.fromEntries(Object.keys(state.actors).map(id => [id, 0])), xpEvents: {}, transfers: {}, foodDays: {}, storePosition: { x: 0, y: 0 }, fence: { level: 1, hp: rules.tables.fences[0].hp } };
  const supply = supplement<{ foodSupply: { siteCount?: number; capacity?: number } }>(rules, 'D12').foodSupply;
  if (supply.siteCount && supply.capacity) state.economy.foodSources = Object.fromEntries(Array.from({ length: supply.siteCount }, (_, i) => {const id=`food-site-${i}`;return [id,{id,position:{x:2+i*2,y:2},remaining:supply.capacity!,capacity:supply.capacity!,refilledInterval:0}];}));
}
export function addResourceNode(state: VillageState, rules: CompiledVillageRules, spec: { id: string; resource: 'wood' | 'stone' | 'rope'; level: number; position: Point }) {
  ensure(state.economy && state.ruleHash === rules.ruleHash && validId(spec.id) && !Object.hasOwn(state.economy.nodes, spec.id), 'Duplicate node or missing economy');
  const source = rules.tables.nodes.find(n => n.resource === spec.resource && n.level === spec.level);
  ensure(source && [spec.position.x, spec.position.y].every(Number.isFinite), 'Invalid source node');
  state.economy.nodes[spec.id] = { ...spec, position: { ...spec.position }, maxHp: source.hp, remainingHp: source.hp, yield: source.yield, depletedEventId: null };
  state.versions[`node:${spec.id}`] = 0;
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function supplement<T>(rules: CompiledVillageRules, decision: string): T {
  return rules.selection.choices[decision].effectiveValues as unknown as T;
}
/** Geography-only adapter. Existing ecological respawn counters never reset new-mode depletion. */
export function importEcologyNodes(state: VillageState, rules: CompiledVillageRules, sites: readonly { id: string; kind: string; stand: Point }[], level = 1) {
  for (const site of sites) if (site.kind === 'wood' && !state.economy?.nodes[site.id]) addResourceNode(state, rules, { id: site.id, resource: 'wood', level, position: site.stand });
}
