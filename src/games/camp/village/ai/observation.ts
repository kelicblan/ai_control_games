import contract from './contract.json';
import normalization from './normalization.json';
import { digest, ensure } from '../../../../../packages/action-runtime/src/json';
import type { PolicyHead, PolicyInput, PolicySpec } from '../../../../../packages/policy-runtime/src/types';
import type { KnowledgeSnapshot } from '../../../../../packages/social-core/src/types';
import type { VillageState } from '../domain/types';
import { projectSocialContext } from '../social/policy-projection';
import { selectWorldRules } from '../config/load';
import type { CompiledVillageRules } from '../config/schema';
import { readVillageClock } from '../domain/clock';
import { buildCandidates } from './candidates';
import { deriveStats } from '../domain/stats';
import { boundedCandidates } from './candidate-budget';
import { distance,supplement } from '../systems/resources';
export const V4_SPEC: PolicySpec = {
  schemaId: contract.schemaId, candidateSchemaId: contract.candidateSchemaId,
  featureHash: digest({ groups: contract.stateGroups, actions: contract.actions, numeric: contract.candidateNumeric, life: contract.life, tactical: contract.tactical }),
  normalizerHash: digest(normalization), heads: { life: contract.life, tactical: contract.tactical },
};
export function stateFeatureNames(head: PolicyHead): string[] {
  return contract[head].stateGroups.flatMap(g => contract.stateGroups[g as keyof typeof contract.stateGroups].map(f => f.id));
}
export function normalizeFeature(name: string, value: number | undefined): number {
  if (value === undefined) return -1;
  ensure(Number.isFinite(value), `Nonfinite feature ${name}`);
  const field = normalization.fields[name as keyof typeof normalization.fields];
  ensure(!!field, `Unknown feature ${name}`);
  if (field.transform === 'signed-unit') return Math.max(-1, Math.min(1, value));
  const scaled = field.transform === 'signed-margin' ? (value / field.scale + 1) / 2 : field.transform === 'log1p' ? Math.log1p(Math.max(0, value)) / Math.log1p(field.scale) : value / field.scale;
  return Math.max(0, Math.min(1, scaled));
}
export function buildObservation(state: VillageState, actorId: string, knowledge: KnowledgeSnapshot, head: PolicyHead, rules: CompiledVillageRules = selectWorldRules('village-v1', state.ruleVersion)): PolicyInput {
  ensure(rules.ruleHash === state.ruleHash, 'Observation rules mismatch');
  const clock = readVillageClock(state.elapsed, rules.clock), cycle = rules.clock.daylightSeconds + rules.clock.nightSeconds;
  const actor = state.actors[actorId]; ensure(!!actor && knowledge.actorId === actorId, 'Observation ownership mismatch');
  const b = actor.body, a = state.economy ? deriveStats(actor.attributes, actor.level, actor.equipment ? state.economy.items[actor.equipment]?.recipeId ?? null : null, rules) : actor.attributes;
  const values: Record<string, number> = { ...actor.personality, ...projectSocialContext(actorId, knowledge, actor.personal.goals, actor.personal.relations),
    hp_ratio: b.hp / b.maxHp, hunger: b.hunger, energy: b.energy, morale: b.morale, fear: b.fear, wetness: b.wetness,
    rest_need: (100 - b.energy) / 100, food_need: b.hunger / 100,
    is_downed: +b.downed, is_incapacitated: +b.incapacitated, can_move: +(b.hp > 0 && !b.downed && !b.incapacitated),
    level_norm: actor.level, attack_log: a.attack, defense_norm: a.defense, attack_rate_norm: a.attackSpeed, range_norm: a.range,
    hit_prob: a.hitRate, crit_prob: a.critRate, crit_multiplier_norm: a.critMultiplier, move_speed_norm: a.moveSpeed,
    gather_eff_norm: a.gather, explore_ability_norm: a.explore, craft_ability_norm: a.craft,
    has_melee_weapon: +(!!actor.equipment && a.range <= 2), has_ranged_weapon: +(!!actor.equipment && a.range > 2),
    day_phase_sin: Math.sin(2 * Math.PI * clock.cycleSeconds / cycle), day_phase_cos: Math.cos(2 * Math.PI * clock.cycleSeconds / cycle),
    is_night: +clock.isNight, world_age_norm: state.elapsed,
  };
  if(state.economy){const config=supplement<{carryCapacity:number;baseMoveSpeed:number}>(rules,'D17'),gap=distance(actor.position,state.economy.storePosition);values.load_ratio=Object.values(actor.carried).reduce((x,y)=>x+y,0)/config.carryCapacity;values.carry_capacity_log=config.carryCapacity;values.distance_home_log=gap;values.return_eta_norm=gap/(config.baseMoveSpeed*a.moveSpeed);values.is_at_village=+(gap<=2);}
  if(state.combat){const local=Object.values(knowledge.entities).filter(e=>state.elapsed-e.at<=5),enemies=local.filter(e=>e.kind==='enemy'&&Number(e.values.hp)>0),allies=local.filter(e=>e.kind==='ally');values.visible_enemy_count=enemies.length;values.known_ally_count=allies.length;values.visible_injured_count=allies.filter(e=>Number(e.values.hp)<Number(e.values.maxHp)).length;values.visible_downed_count=allies.filter(e=>e.values.downed===true).length;if(enemies.length)values.nearest_enemy_distance=Math.min(...enemies.map(e=>distance(actor.position,e.values.position as unknown as {x:number;y:number})));}
  const agreements=Object.values(state.social.agreements).filter(a=>a.parties.includes(actorId)&&!['fulfilled','cancelled','breached'].includes(a.status));
  values.pending_promise_load=agreements.length;values.has_active_plan=+(agreements.length>0);values.commitment_strength=agreements.length?1:0;
  if(agreements.length){const agreement=agreements[0],proposal=state.social.proposals[agreement.proposalId],ownSteps=proposal.terms.steps.filter(s=>s.actorId===actorId);values.plan_progress=ownSteps.length?Math.min(1,Object.values(knowledge.evidence).filter(e=>e.kind==='execution.completed'&&e.facts.planId===`${proposal.id}:plan`).length/ownSteps.length):0;values.change_requested=+(agreement.reason==='change-requested');values.plan_blocked=+(agreement.status==='waiting_conditions'||!!agreement.reason);if(proposal.terms.deadline!==null)values.deadline_pressure=1-Math.max(0,Math.min(1,(proposal.terms.deadline-state.elapsed)/60));}
  // Only explicitly observed feature facts enter perception; authoritative inventory and other minds do not.
  const names = new Set(stateFeatureNames(head));
  for (const entity of Object.values(knowledge.entities)) for (const [key, value] of Object.entries(entity.values)) {
    if (names.has(key) && !Object.prototype.hasOwnProperty.call(values, key) && typeof value === 'number') values[key] = value;
  }
  values.store_information_confidence ??= 0;
  if (state.institutions) values.is_guard_assigned = +Object.values(state.institutions).some(r => r.kind === 'guard-duty' && r.members.includes(actorId) && r.effectiveAt <= state.elapsed && state.elapsed < r.expiresAt);
  const legalActions = new Set<string>(contract[head].actionIds);
  const allCandidates = buildCandidates(state, actorId, normalizeFeature, knowledge).filter(c => legalActions.has(c.action)), candidates = boundedCandidates(allCandidates,head);
  return { head, schemaId: V4_SPEC.schemaId, actorId, simTime: state.elapsed, ruleHash: state.ruleHash, featureHash: V4_SPEC.featureHash, normalizerHash: V4_SPEC.normalizerHash,
    stateFeatures: stateFeatureNames(head).map(name => normalizeFeature(name, values[name])), candidates, knownLegalMask: candidates.map(() => true), truncatedCandidates: allCandidates.length - candidates.length };
}
