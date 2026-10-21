import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState, Point } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { distance, supplement } from './resources';
import { workNode } from './gathering';
import { transferResources } from './hauling';
import { handoverItem, equipItem } from './equipment';
import { lendItem, returnLoan } from '../social/rights';
import { moveTowards } from './combat-actions';
import { routeDistance } from './navigation';
import { fenceBlocksSegment } from './targeting';
import { deriveStats } from '../domain/stats';
import { recipeCost,professionMultiplier } from './profession';
import { workshopTarget, workshopTravel, approachWorkstation, WORKSHOP_RULES } from './workshop';
const rulesFor = (s: VillageState) => selectWorldRules('village-v1', s.ruleVersion);
const actorStats = (s: VillageState, id: string) => deriveStats(s.actors[id].attributes, s.actors[id].level, s.actors[id].equipment ? s.economy!.items[s.actors[id].equipment!].recipeId : null, rulesFor(s));
function target(s: VillageState, action: string, id?: string): Point {
  ensure(s.economy, 'Missing economy');
  if (action === 'DEPOSIT') return s.economy.storePosition;
  if (action === 'PICK_UP') { const c = id && s.economy.containers[id]; ensure(c, 'Unknown container'); return c.position; }
  const n = id && s.economy.nodes[id]; ensure(n && n.remainingHp > 0, 'Unknown or depleted node'); return n.position;
}
function travel(s: VillageState, actor: string, destination: Point) {
  const speed = supplement<{ baseMoveSpeed: number }>(rulesFor(s), 'D17').baseMoveSpeed * s.actors[actor].attributes.moveSpeed;
  const route = s.navigation ? routeDistance(s, s.actors[actor].position, destination) : distance(s.actors[actor].position, destination);
  ensure(speed > 0 && Number.isFinite(route), 'Actor cannot reach destination'); return route / speed;
}
const logistics: ActionCapability<VillageState>[] = ['GATHER_WOOD', 'GATHER_STONE', 'GATHER_ROPE', 'DEPOSIT', 'PICK_UP'].map(action => ({
  id: action, validate(s, c) {
    const r = rulesFor(s); ensure(r.capabilities.gather.configured && s.economy, 'Gather capability not configured');
    if (action === 'DEPOSIT') ensure(Object.values(s.actors[c.actorId].carried).some(n => n > 0), '没有携带物资，不能空入库获取经验');
    const destination = target(s, action, c.targetId);
    if (action.startsWith('GATHER_')) ensure(s.economy.nodes[c.targetId!].resource === action.slice(7).toLowerCase(), 'Wrong resource node');
    const work = action.startsWith('GATHER_') ? Math.min(5, s.economy.nodes[c.targetId!].remainingHp / (r.tables.globals.RESOURCE_GATHER_BASE * actorStats(s, c.actorId).gather)) : .1;
    return { duration: Math.max(.1, travel(s, c.actorId, destination) + work), cost: {} };
  },
  advance(s, e, dt) {
    const p = s.actors[e.command.actorId].position, destination = target(s, action, e.command.targetId);
    const speed = supplement<{ baseMoveSpeed: number }>(rulesFor(s), 'D17').baseMoveSpeed * s.actors[e.command.actorId].attributes.moveSpeed;
    if (distance(p, destination) > 1 || fenceBlocksSegment(s,p,destination)) ensure(moveTowards(s, p, destination, speed, dt), 'Logistics route blocked');
  },
  complete(s, e) {
    const c = e.command;
    ensure(!fenceBlocksSegment(s,s.actors[c.actorId].position,target(s,action,c.targetId)),'Interaction blocked by an obstacle');
    if (action.startsWith('GATHER_')) { const r = rulesFor(s); workNode(s, c.actorId, c.targetId!, r.tables.globals.RESOURCE_GATHER_BASE * actorStats(s, c.actorId).gather * 5); s.actors[c.actorId].body.energy = Math.max(0, s.actors[c.actorId].body.energy - 2); }
    else ensure(transferResources(s, { operationId: `transfer:${e.id}`, actorId: c.actorId, destination: action === 'DEPOSIT' ? 'store' : 'carried', ...(c.targetId ? { containerId: c.targetId } : {}) }).accepted, '没有实际搬运物资，任务未完成');
  },
}));
const orders: ActionCapability<VillageState>[] = ['CRAFT', 'UPGRADE_FENCE'].map(action => ({
  id: action, validate(s, c) {
    const r = rulesFor(s), economy = s.economy, actor = s.actors[c.actorId]; ensure(economy && r.capabilities.craft.configured && typeof c.parameters.recipeId === 'string' && typeof c.parameters.recipientId === 'string' && s.actors[c.parameters.recipientId], 'Invalid order');
    ensure(actor.attributes.craft > 0, 'Workstation unavailable');
    if (action === 'CRAFT' && economy.workshop) ensure(economy.workshop.completedEventId, '请先建造工坊');
    else ensure(distance(actor.position, economy.storePosition) <= 2, 'Workstation unavailable');
    const recipe = action === 'CRAFT' ? r.tables.weapons.find(w => w.id === c.parameters.recipeId && (w.id !== 'WPN006' || s.combat?.unlockedRecipes.includes(w.id))) : r.tables.fences.find(f => String(f.level) === c.parameters.recipeId && f.level === economy.fence.level + 1);
    ensure(recipe, 'Recipe unavailable');
    if (action === 'UPGRADE_FENCE') ensure(!Object.values(economy.orders).some(o => o.kind === 'upgradeFence' && s.executions[o.executionId] && ['accepted', 'running'].includes(s.executions[o.executionId].status)), 'Fence is busy');
    if(action==='UPGRADE_FENCE')ensure(!Object.values(s.executions).some(e=>e.command.action==='REPAIR_FENCE'&&['accepted','running'].includes(e.status)),'Fence repair is active');
    const work = 'workSeconds' in recipe ? recipe.workSeconds : supplement<{ upgradeWorkSeconds: number }>(r, 'D10').upgradeWorkSeconds;
    economy.orders[c.operationId] = { id: c.operationId, executionId: `${s.worldId}:ex${s.nextExecution}`, actorId: c.actorId, kind: action === 'CRAFT' ? 'craft' : 'upgradeFence', recipeId: c.parameters.recipeId, recipientId: c.parameters.recipientId, agreementId: typeof c.parameters.agreementId === 'string' ? c.parameters.agreementId : null, status: 'working', itemId: null };
    if (action === 'CRAFT' && c.parameters.deliver === true) economy.orders[c.operationId].deliveryRequested = true;
    return { duration: work / (actor.attributes.craft*professionMultiplier(r,actor,'craftMultiplier')) + (action === 'CRAFT' && economy.workshop ? workshopTravel(s, c.actorId, workshopTarget(s)) : 0), cost: 'id' in recipe?recipeCost(r,actor,recipe):{...recipe.cost} };
  }, advance(s, e, dt) {
    if (action === 'CRAFT' && s.economy?.workshop && !s.economy.workshop.legacyExecutions.includes(e.id)) approachWorkstation(s, e.command.actorId, workshopTarget(s), dt);
  }, complete(s, e) {
    if (action === 'CRAFT' && s.economy?.workshop && !s.economy.workshop.legacyExecutions.includes(e.id)) ensure(distance(s.actors[e.command.actorId].position, workshopTarget(s)) <= WORKSHOP_RULES.interactionRadius && !fenceBlocksSegment(s, s.actors[e.command.actorId].position, workshopTarget(s)), '尚未到达工坊工位');
    const order = s.economy!.orders[e.command.operationId]; ensure(order, 'Order missing'); order.status = 'completed';
    if (order.kind === 'craft') {
      const itemId = `item:${e.id}`; order.itemId = itemId;
      s.economy!.items[itemId] = { id: itemId, recipeId: order.recipeId, ownerId: order.actorId, holderId: order.actorId, equippedBy: null, orderId: order.id };
      const crafted = appendEvent(s, 'item.crafted', [order.actorId], { itemId, recipeId: order.recipeId, orderId: order.id, recipientId: order.recipientId });
      crafted.visibleTo = [...new Set([order.actorId, order.recipientId, s.playerId])];
    } else { const fence = rulesFor(s).tables.fences.find(f => String(f.level) === order.recipeId)!;if(s.combat&&s.economy!.fence.hp===0)s.combat.navigationRevision++;s.economy!.fence = { level: fence.level, hp: fence.hp };s.versions['fence:public']=(s.versions['fence:public']??0)+1; appendEvent(s, 'fence.upgraded', [order.actorId], { level: fence.level }); }
  },
}));
export const LIFE_CAPABILITIES: ActionCapability<VillageState>[] = [...logistics, ...orders, {
  id: 'UNEQUIP', validate(s, c) { ensure(s.actors[c.actorId]?.equipment && Object.keys(c.parameters).length === 0, '没有可卸下的装备'); return { duration: .1, cost: {} }; },
  complete(s, e) { const a = s.actors[e.command.actorId], item = s.economy!.items[a.equipment!]; item.equippedBy = null; a.equipment = null; s.versions[`actor:${a.id}`]++; appendEvent(s, 'equipment.unequipped', [a.id], { itemId: item.id, recipeId: item.recipeId }); },
}, {
  id: 'REST', validate(s, c) { ensure(s.economy && typeof c.parameters.seconds === 'number' && c.parameters.seconds >= .1 && c.parameters.seconds <= 60, 'Invalid rest'); return { duration: c.parameters.seconds, cost: {} }; },
  complete(s, e) { const actor = s.actors[e.command.actorId], before = actor.body.energy; actor.body.energy = Math.min(100, before + e.duration * 2); appendEvent(s, 'rest.completed', [actor.id], { seconds: e.duration, beforeEnergy: before, afterEnergy: actor.body.energy, agreementId: e.command.planId?.replace(/:plan$/, ':agreement') ?? null }); },
}, {
  id: 'TRANSFER', validate(s, c) { ensure(s.economy && typeof c.parameters.itemId === 'string' && typeof c.targetId === 'string' && Object.keys(c.parameters).every(k => ['itemId', 'rights'].includes(k)) && (c.parameters.rights === undefined || c.parameters.rights === 'use' || c.parameters.rights === 'return'), 'Invalid handover');
    const item = s.economy.items[c.parameters.itemId], recipient = s.actors[c.targetId];
    ensure(item && recipient && (c.parameters.rights==='return'?item.ownerId===recipient.id:item.ownerId===c.actorId) && item.holderId === c.actorId && item.equippedBy === null && distance(s.actors[c.actorId].position, recipient.position) <= 2, 'Handover conditions not met');
    return { duration: .1, cost: {} }; },
  complete(s, e) { if (e.command.parameters.rights === 'use') lendItem(s, e.command.actorId, e.command.targetId!, String(e.command.parameters.itemId), e.id); else if(e.command.parameters.rights==='return')returnLoan(s,e.command.actorId,e.command.targetId!,String(e.command.parameters.itemId),e.id);else handoverItem(s, { operationId: `grant:${e.id}`, actorId: e.command.actorId, recipientId: e.command.targetId!, itemId: String(e.command.parameters.itemId), ...(e.command.planId ? { agreementId: e.command.planId.replace(/:plan$/, ':agreement') } : {}) }); },
}, {
  id: 'EQUIP', validate(s, c) { ensure(s.economy && typeof c.parameters.itemId === 'string', 'Invalid equip'); return { duration: .1, cost: {} }; }, complete(s, e) { equipItem(s, e.command.actorId, String(e.command.parameters.itemId)); },
}];
