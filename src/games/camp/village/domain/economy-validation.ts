import { canonical, ensure, record } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import type { VillageState } from './types';
import type { CompiledVillageRules } from '../config/schema';
import { supplement } from '../systems/resources';
import { authorizeResourceUse } from '../../../../../packages/social-core/src/institutions';
import {newWorld} from '../../world/newWorldProfile';
export function validateEconomy(state: VillageState, rules: CompiledVillageRules) {
  const e = state.economy; if (!e) return;
  ensure(record(e) && e.version === 1 && rules.capabilities.gather.configured && ['nodes', 'containers', 'items', 'orders', 'offers', 'experience', 'xpEvents', 'transfers', 'foodDays'].every(k => record(e[k as keyof typeof e])), 'Invalid economy schema');
  const point = (p: unknown) => record(p) && [p.x, p.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7);
  const quantities = (q: unknown) => record(q) && Object.entries(q).every(([k, n]) => ['wood', 'stone', 'rope', 'food', 'meat'].includes(k) && Number.isSafeInteger(n) && (n as number) >= 0);
  ensure(point(e.storePosition) && Number.isSafeInteger(e.fence.level) && rules.tables.fences.some(f => f.level === e.fence.level && e.fence.hp >= 0 && e.fence.hp <= f.hp), 'Invalid store or fence');
  if (e.workshop) {
    const w = e.workshop;
    ensure(record(w) && w.version === 1 && point(w.position) && Array.isArray(w.legacyExecutions) && w.legacyExecutions.length <= 200 && w.legacyExecutions.every(id => state.executions[id]?.command.action === 'CRAFT'), 'Invalid workshop');
    ensure(w.buildExecutionId === null || state.executions[w.buildExecutionId]?.command.action === 'BUILD_WORKSHOP', 'Invalid workshop build');
    ensure(w.completedEventId === null || state.events.some(event => event.id === w.completedEventId && event.kind === 'workshop.built' && event.executionId === w.buildExecutionId), 'Missing workshop completion evidence');
  }
  if (e.journey) {
    const j = e.journey;
    ensure(record(j) && j.version === 1 && Number.isSafeInteger(j.lastEvent) && j.lastEvent >= 0 && j.lastEvent < state.nextEvent && record(j.completed) && record(j.hunts), 'Invalid journey');
    for (const [id, g] of Object.entries(j.completed)) ensure(['food', 'workshop', 'bow', 'hunt', 'return', 'growth'].includes(id) && record(g) && Number.isFinite(g.at) && g.at >= 0 && g.at <= state.elapsed && state.events.some(event => event.id === g.eventId && event.kind === 'milestone.completed' && event.facts.goalId === id), 'Missing milestone evidence');
    for (const [id, ref] of Object.entries(j.hunts)) ensure(state.actors[id] && state.events.some(event => event.id === ref && ['wildlife.hunt_completed', 'resources.picked_up'].includes(event.kind) && event.participants.includes(id)), 'Missing hunt evidence');
  }
  if (e.foodSources) {
    const config=supplement<{foodSupply:{siteCount?:number;capacity?:number;refillSeconds?:number}}>(rules,'D12').foodSupply;
    const forest=e.forestExpansion?newWorld?.forestExpansion:undefined;
    ensure(!e.forestExpansion||forest?.id===e.forestExpansion,'Unknown forest source geography');
    const extra=forest?.resources.filter(s=>s.kind!=='wood')??[];
    ensure(record(e.foodSources)&&(config.siteCount??0)+extra.length===Object.keys(e.foodSources).length,'Invalid food sources');
    for(const site of extra){const source=e.foodSources[site.id];ensure(source&&source.position.x===site.stand.x&&source.position.y===site.stand.y,'Forest food source geography changed');}
    for(const [id,site]of Object.entries(e.foodSources))ensure(validId(id)&&site.id===id&&point(site.position)&&site.capacity===config.capacity&&Number.isSafeInteger(site.remaining)&&site.remaining>=0&&site.remaining<=site.capacity&&Number.isSafeInteger(site.refilledInterval)&&site.refilledInterval>=0&&site.refilledInterval<=Math.floor(state.elapsed/config.refillSeconds!),'Invalid food supply ledger');
  }
  for (const [id, node] of Object.entries(e.nodes)) {
    const source = rules.tables.nodes.find(n => n.resource === node.resource && n.level === node.level);
    ensure(validId(id) && node.id === id && source && node.maxHp === source.hp && node.yield === source.yield && Number.isFinite(node.remainingHp) && node.remainingHp >= 0 && node.remainingHp <= node.maxHp && point(node.position), 'Invalid persistent node');
    ensure(node.remainingHp > 0 ? node.depletedEventId === null : typeof node.depletedEventId === 'string' && state.events.some(event => event.id === node.depletedEventId && event.kind === 'node.depleted' && event.facts.nodeId === id), 'Node depletion evidence missing');
  }
  for (const [id, container] of Object.entries(e.containers)) ensure(validId(id) && container.id === id && point(container.position) && quantities(container.resources) && state.events.some(event => event.id === container.sourceEventId && (event.kind === 'node.depleted' || event.kind==='wildlife.harvested' && event.facts.containerId===id || event.kind === 'enemy.died' && state.combat?.loot[event.id] === id)), 'Invalid resource container');
  for (const [id, item] of Object.entries(e.items)) ensure(validId(id) && item.id === id && rules.tables.weapons.some(w => w.id === item.recipeId) && state.actors[item.ownerId] && state.actors[item.holderId] && (item.equippedBy === null || item.holderId === item.equippedBy && state.actors[item.equippedBy]?.equipment === id && (item.ownerId === item.equippedBy || authorizeResourceUse(state.institutions ?? {}, item.equippedBy, id, state.elapsed).allowed)) && e.orders[item.orderId]?.itemId === id, 'Invalid item rights');
  for (const actor of Object.values(state.actors)) {
    ensure(actor.equipment === null || e.items[actor.equipment]?.equippedBy === actor.id, 'Invalid equipped item');
    const capacity = supplement<{ carryCapacity: number }>(rules, 'D17').carryCapacity;
    ensure(quantities(actor.carried) && Object.values(actor.carried).reduce((a, b) => a + b, 0) <= capacity, 'Carry capacity exceeded');
    const xp = e.experience[actor.id], thresholds = supplement<{ xpThresholds: number[] }>(rules, 'D14').xpThresholds;
    ensure(Number.isSafeInteger(xp) && xp >= 0 && actor.level === Math.min(10, thresholds.filter(t => t <= xp).length), 'Invalid experience or level');
  }
  for (const [id, order] of Object.entries(e.orders)) ensure(validId(id) && order.id === id && state.actors[order.actorId] && state.actors[order.recipientId] && state.executions[order.executionId]?.command.operationId === id && ['craft', 'upgradeFence'].includes(order.kind) && ['working', 'completed', 'cancelled'].includes(order.status) && (order.itemId === null || e.items[order.itemId]?.orderId === id), 'Invalid work order');
  for (const order of Object.values(e.orders)) ensure((order.deliveryRequested === undefined || typeof order.deliveryRequested === 'boolean') && (order.deliveryOperationId === undefined || validId(order.deliveryOperationId)), 'Invalid delivery request');
  for (const [id, offer] of Object.entries(e.offers)) ensure(validId(id) && offer.id === id && rules.tables.actors.some(a => a.id === offer.archetypeId && a.kind !== 'player') && Number.isFinite(offer.expiresAt) && offer.expiresAt >= 0 && (offer.acceptedBy === null || state.actors[offer.acceptedBy]?.archetypeId === offer.archetypeId), 'Invalid recruit offer');
  ensure(Object.values(e.transfers).every(t => typeof t.digest === 'string' && /^[a-f0-9]{64}$/.test(t.digest) && typeof t.accepted === 'boolean') && Object.values(e.foodDays).every(v => v === true) && Object.values(e.xpEvents).every(v => /^\d+$/.test(v)), 'Invalid economy ledgers');
  canonical(e);
}
