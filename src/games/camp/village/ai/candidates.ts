import contract from './contract.json';
import type { ActionCandidate } from '../../../../../packages/policy-runtime/src/types';
import type { VillageState } from '../domain/types';
import type { KnowledgeSnapshot } from '../../../../../packages/social-core/src/types';
import { selectWorldRules } from '../config/load';
import { distance, supplement } from '../systems/resources';
import { deriveStats } from '../domain/stats';
import { recipeCost,professionMultiplier } from '../systems/profession';
import { combatCandidates } from './combat-candidates';
import { authorizeResourceUse } from '../../../../../packages/social-core/src/institutions';
import {repairWorldPosition} from '../../world/navigation';
/** Candidate capabilities are deliberately limited to executors implemented in this phase. */
export function buildCandidates(state: VillageState, actorId: string, normalize: (field: string, value: number | undefined) => number, knowledge: KnowledgeSnapshot = state.actors[actorId].personal.knowledge): ActionCandidate[] {
  const b = state.actors[actorId].body;
  const busy = Object.values(state.executions).some(e => e.command.actorId === actorId && ['accepted', 'running'].includes(e.status));
  const candidates: ActionCandidate[] = b.hp > 0 && !b.downed && !b.incapacitated && !busy ? [.5, 1].map(seconds => {
    const numeric: Record<string, number> = { distance_log: 0, travel_eta_norm: 0, work_eta_norm: seconds, known_reachable: 1, known_obstacle: 0, knowledge_confidence: 1, knowledge_age_norm: 0, is_continuation: 0, is_player_request: 0, cooldown_ready: 1 };
    return { id: `wait-${seconds}`, action: 'WAIT', actorId, parameters: { seconds }, readSet: { [`actor:${actorId}`]: state.versions[`actor:${actorId}`] },
      features: [...contract.actions.map(action => +(action.id === 'WAIT')), ...contract.candidateNumeric.map(f => normalize(f.id, numeric[f.id]))] };
  }) : [];
  if (!state.economy || !candidates.length) return candidates;
  const actor = state.actors[actorId], rules = selectWorldRules('village-v1', state.ruleVersion), config = supplement<{ carryCapacity: number; baseMoveSpeed: number }>(rules, 'D17');
  const stats = deriveStats(actor.attributes, actor.level, actor.equipment ? state.economy.items[actor.equipment]?.recipeId ?? null : null, rules);
  const load = Object.values(actor.carried).reduce((a, b) => a + b, 0);
  const push = (id: string, action: string, parameters: ActionCandidate['parameters'], numeric: Record<string, number>, targetId?: string, readSet: ActionCandidate['readSet'] = {}) => {
    const goalKind = action === 'REST' ? 'rest' : action === 'CRAFT' || action === 'EQUIP' ? 'equipment' : action === 'EXPLORE' ? 'exploration' : action==='SOCIAL_VISIT'?'affiliation':action === 'HEAL' || action === 'RESCUE'||action==='FOLLOW'||action==='ESCORT' ? 'care' : 'contribution';
    const priority = Math.max(0, ...actor.personal.goals.filter(g => g.kind === goalKind).map(g => g.priority * (1 - g.progress)));
    if (priority > 0) numeric.personal_goal_alignment = priority;
    const resource=action==='EXPLORE'?String(parameters.resource):action.startsWith('GATHER_')?action.slice(7).toLowerCase():null;
    const knownStore=knowledge.entities['inventory:public'];
    if(resource&&knownStore){
      const population=Math.max(1,Number(knownStore.values.known_population_ratio??0)+1),target=resource==='wood'?Math.max(35,population*8):resource==='stone'?Math.max(12,population*3):resource==='rope'?Math.max(10,population*2):Math.max(6,population*3);
      const amount=Number(knownStore.values[`known_free_${resource}_log`]??-1);
      if(amount>=0){numeric.public_goal_alignment=Math.max(0,1-amount/target);numeric.urgency=Math.max(numeric.urgency??0,numeric.public_goal_alignment*.6);
        const material=resource==='wood'?14:resource==='stone'?4:resource==='rope'?5:0;
        if(material&&(!actor.equipment||stats.range<=2))numeric.personal_goal_alignment=Math.max(numeric.personal_goal_alignment??0,1-amount/material,0);
      }
    }
    const relation=targetId?actor.personal.relations[targetId]:undefined;if(relation)Object.assign(numeric,{trust_target:relation.trust,affinity_target:relation.affinity,reciprocity_target:relation.reciprocity,rivalry_target:relation.rivalry});
    candidates.push({ id, action, actorId, parameters, ...(targetId ? { targetId } : {}), readSet: { [`actor:${actorId}`]: state.versions[`actor:${actorId}`], ...readSet },
      features: [...contract.actions.map(a => +(a.id === action)), ...contract.candidateNumeric.map(f => normalize(f.id, numeric[f.id]))] });
  };
  push('rest-5', 'REST', { seconds: 5 }, { work_eta_norm: 5, known_reachable: 1, knowledge_confidence: 1, personal_goal_alignment: (100 - b.energy) / 100, expected_yield_norm: Math.min(10, 100 - b.energy) / 10 });
  for (const entity of Object.values(knowledge.entities).sort((a, b) => a.id.localeCompare(b.id))) {
    if (entity.kind === 'resource-node' && Number(entity.values.remainingHp) > 0 && load < config.carryCapacity) {
      const p = entity.values.position as unknown as { x: number; y: number }, gap = distance(actor.position, p), action = `GATHER_${String(entity.values.resource).toUpperCase()}`;
      const source = rules.tables.nodes.find(n => n.resource === entity.values.resource && n.level === entity.values.level);
      if (source && stats.gather > 0) push(`gather-${entity.id}`, action, {}, { distance_log: gap, travel_eta_norm: gap / (config.baseMoveSpeed * stats.moveSpeed), work_eta_norm: Math.min(5, Number(entity.values.remainingHp) / (5 * stats.gather)), expected_yield_norm: Math.min(config.carryCapacity - load, source.yield) / config.carryCapacity, known_reachable: 1, knowledge_confidence: entity.confidence, knowledge_age_norm: state.elapsed - entity.at }, entity.id, { [`node:${entity.id}`]: entity.version });
    }
    if (entity.kind === 'resource-container' && Number(entity.values.quantity) > 0 && load < config.carryCapacity) push(`pickup-${entity.id}`, 'PICK_UP', {}, { work_eta_norm: .1, known_reachable: 1, knowledge_confidence: entity.confidence }, entity.id);
  }
  const store = knowledge.entities['inventory:public'];
  if(load>0){const gap=distance(actor.position,state.economy.storePosition);push('deposit-store','DEPOSIT',{}, {distance_log:gap,travel_eta_norm:gap/(config.baseMoveSpeed*stats.moveSpeed),work_eta_norm:.1,expected_yield_norm:load/config.carryCapacity,known_reachable:1,knowledge_confidence:1});}
  if (state.ruleVersion === 'p4-social-content-v1') {
    for(const ally of Object.values(knowledge.entities).filter(e=>e.kind==='ally'&&Number(e.values.hp)>0&&e.values.downed!==true&&state.elapsed-e.at<=5)){
      const gap=distance(actor.position,ally.values.position as unknown as {x:number;y:number});
      if(gap<=2&&actor.personal.goals.some(g=>g.kind==='affiliation'&&g.priority*(1-g.progress)>.3))push(`visit-${ally.id}`,'SOCIAL_VISIT',{seconds:5},{distance_log:gap,knowledge_confidence:ally.confidence,known_reachable:1,work_eta_norm:5},ally.id);
      if(gap<=12&&actor.personal.goals.some(g=>g.kind==='care'&&g.priority*(1-g.progress)>.3))for(const action of ['FOLLOW','ESCORT'])push(`${action.toLowerCase()}-${ally.id}`,action,{seconds:5},{distance_log:gap,knowledge_confidence:ally.confidence,known_reachable:1,work_eta_norm:5},ally.id);
    }
    for(const agreement of Object.values(state.social.agreements).filter(a=>a.parties.includes(actorId)&&!['fulfilled','cancelled','breached'].includes(a.status)&&a.reason!=='change-requested')){const p=state.social.proposals[agreement.proposalId];if(agreement.reason||p.terms.deadline!==null&&p.terms.deadline<=state.elapsed)push(`change-${agreement.id}`,'REQUEST_CHANGE',{agreementId:agreement.id},{knowledge_confidence:1,urgency:1,commitment_match:1});}
    for (const site of Object.values(knowledge.entities).filter(e=>e.kind==='food-source'&&Number(e.values.remaining)>0)) if(load<config.carryCapacity)push(`food-${site.id}`,'GATHER_FOOD',{}, {distance_log:distance(actor.position,site.values.position as unknown as {x:number;y:number}),known_reachable:1,knowledge_confidence:site.confidence,expected_yield_norm:1/config.carryCapacity,urgency:b.hunger/100},site.id);
    const duty = Object.values(state.institutions ?? {}).find(r => r.kind === 'guard-duty' && r.members.includes(actorId) && r.effectiveAt <= state.elapsed && state.elapsed < r.expiresAt);
    if (duty) { const index=duty.members.indexOf(actorId), p={x:state.economy.storePosition.x+(index%2?3:-3),y:state.economy.storePosition.y+3}; if(distance(actor.position,p)>1)push('guard-assignment','GUARD',p,{known_reachable:1,knowledge_confidence:1,commitment_match:1,public_goal_alignment:1,urgency:.8}); }
    for (const item of Object.values(state.economy.items).filter(i => i.holderId === actorId && (i.ownerId===actorId||authorizeResourceUse(state.institutions??{},actorId,i.id,state.elapsed).allowed) && i.equippedBy === null)) {const weapon=rules.tables.weapons.find(w=>w.id===item.recipeId)!,current=actor.equipment?rules.tables.weapons.find(w=>w.id===state.economy!.items[actor.equipment!]?.recipeId):undefined;if(weapon.attack<=(current?.attack??0))continue;push(`equip-${item.id}`, 'EQUIP', { itemId: item.id }, { known_reachable: 1, knowledge_confidence: 1, urgency: .8,expected_yield_norm:(weapon.attack-(current?.attack??0))/12,range_margin_norm:weapon.range-stats.range });}
    if (store && b.hunger > 0 && Number(store.values.known_free_food_log) >= 1 && distance(actor.position, state.economy.storePosition) <= 2) push('eat-store', 'EAT', {}, { food_cost_norm: 1 / 5, known_reachable: 1, knowledge_confidence: store.confidence, urgency: b.hunger / 100 });
    if (rules.capabilities.explore.configured && b.energy >= 30) for (const [i, resource] of (['wood', 'stone', 'rope'] as const).entries()) {
      const exhausted=Object.values(knowledge.entities).filter(e=>e.kind==='resource-node'&&e.values.resource===resource&&Number(e.values.remainingHp)<=0).length;
      const angle = i * Math.PI * 2 / 3 + Math.atan2(actor.position.y-state.economy.storePosition.y,actor.position.x-state.economy.storePosition.x)+exhausted*.7, radius = Math.min(100,20+exhausted*10+Math.floor(state.elapsed/720)%5*10);
      const p=state.navigation?repairWorldPosition({x:state.economy.storePosition.x+Math.cos(angle)*radius,y:state.economy.storePosition.y+Math.sin(angle)*radius},state.seed):{x:state.economy.storePosition.x+Math.cos(angle)*radius,y:state.economy.storePosition.y+Math.sin(angle)*radius};
      push(`explore-${resource}`, 'EXPLORE', { ...p, resource }, { distance_log: distance(actor.position,p), travel_eta_norm: distance(actor.position,p) / (config.baseMoveSpeed * stats.moveSpeed), work_eta_norm: 5, expected_self_risk: .15, knowledge_confidence: 0 });
    }
    const fence = knowledge.entities['fence:public'];
    if (fence && distance(actor.position, state.economy.storePosition) <= 2) {
      const rule = rules.tables.fences.find(f => f.level === fence.values.level)!;
      if (Number(fence.values.hp) < rule.hp && store && Object.entries(rule.repairCost).every(([r,n]) => Number(store.values[`known_free_${r}_log`]) >= n)) push('repair-fence', 'REPAIR_FENCE', {}, { known_reachable: 1, knowledge_confidence: fence.confidence, urgency: 1 - Number(fence.values.hp) / rule.hp });
    }
  }
  if (store) {
    const gap = distance(actor.position, state.economy.storePosition);
    const knownWorkshop = knowledge.entities['workshop:public'];
    if ((gap <= 2 || state.economy.workshop && knownWorkshop?.values.ready === 1) && (!state.economy.workshop || knownWorkshop?.values.ready === 1) && stats.craft > 0) for (const recipe of rules.tables.weapons.filter(w => w.id !== 'WPN006'||store.values.unlocked_wpn006===1)) {
      const cost=recipeCost(rules,actor,recipe);
      if (Object.entries(cost).every(([r, n]) => Number(store.values[`known_free_${r}_log`] ?? -1) >= n)) push(`craft-${recipe.id}`, 'CRAFT', { recipeId: recipe.id, recipientId: actorId, agreementId: null }, { work_eta_norm: recipe.workSeconds / (stats.craft*professionMultiplier(rules,actor,'craftMultiplier')), wood_cost_norm: cost.wood / 35, stone_cost_norm: cost.stone / 12, rope_cost_norm: (cost.rope ?? 0) / 5, known_reachable: 1, knowledge_confidence: store.confidence }, undefined, { 'inventory:public': store.version });
    }
  }
  return [...combatCandidates(state, actorId, knowledge, normalize), ...candidates];
}
