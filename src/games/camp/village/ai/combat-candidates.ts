import contract from './contract.json';
import type { ActionCandidate } from '../../../../../packages/policy-runtime/src/types';
import type { KnowledgeSnapshot } from '../../../../../packages/social-core/src/types';
import type { VillageState, Point } from '../domain/types';
import { combatEntity, fenceBlocksSegment } from '../systems/targeting';
import { distance } from '../systems/resources';
export function combatCandidates(state: VillageState, actorId: string, knowledge: KnowledgeSnapshot, normalize: (name: string, value: number | undefined) => number): ActionCandidate[] {
  if (!state.combat) return [];
  const actor = state.actors[actorId], stats = combatEntity(state, actorId)!.stats, candidates: ActionCandidate[] = [];
  function add(id: string, action: string, targetId: string | undefined, parameters: ActionCandidate['parameters'], numeric: Record<string, number>) {
    const relation = targetId ? actor.personal.relations[targetId] : undefined;
    if (relation) Object.assign(numeric, { trust_target: relation.trust, reciprocity_target: relation.reciprocity, affinity_target: relation.affinity, rivalry_target: relation.rivalry });
    candidates.push({ id, action, actorId, ...(targetId ? { targetId } : {}), parameters, readSet: { [`actor:${actorId}`]: state.versions[`actor:${actorId}`] }, features: [...contract.actions.map(a => +(a.id === action)), ...contract.candidateNumeric.map(f => normalize(f.id, numeric[f.id]))] });
  }
  const enemies = Object.values(knowledge.entities).filter(e => (e.kind === 'enemy'||e.kind==='wildlife'&&actor.equipment!==null&&actor.body.hp/actor.body.maxHp>.6&&actor.body.energy>45&&Object.values(actor.carried).reduce((a,b)=>a+b,0)<10&&['rabbit','pheasant','deer'].includes(String(e.values.species))&&Number(knowledge.entities['inventory:public']?.values.known_free_food_log??0)<20) && Number(e.values.hp) > 0 && state.elapsed - e.at <= 5);
  for (const enemy of enemies) {
    const point = enemy.values.position as unknown as Point, gap = distance(actor.position, point);
    if (!fenceBlocksSegment(state, actor.position, point)) add(`attack-${enemy.id}`, 'ATTACK', enemy.id, {}, { distance_log: gap, range_margin_norm: stats.range - gap, cooldown_ready: +((state.combat!.cooldowns[actorId] ?? 0) <= state.elapsed), knowledge_confidence: enemy.confidence, known_reachable: 1, expected_self_risk: Math.max(0, 1 - actor.body.hp / actor.body.maxHp), urgency: .9 });
    // Generate multiple firing positions; the MLP chooses, executor revalidates geometry.
    for (const sign of [-1, 1]) {
      const d = Math.max(gap, .001), range = Math.max(1, stats.range * .85), p = { x: point.x + (actor.position.x - point.x) / d * range, y: point.y + (actor.position.y - point.y) / d * range + sign };
      if (distance(actor.position, p) <= 20 && !fenceBlocksSegment(state, actor.position, p)) add(`position-${enemy.id}-${sign}`, 'REPOSITION', undefined, p, { distance_log: distance(actor.position, p), known_reachable: 1, range_margin_norm: stats.range - distance(p, point), knowledge_confidence: enemy.confidence, expected_self_risk: .2, urgency: .7 });
    }
  }
  for (const ally of Object.values(knowledge.entities).filter(e => e.kind === 'ally' && distance(actor.position, e.values.position as unknown as Point) <= 2 && state.elapsed - e.at <= 5)) {
    if (ally.values.downed === true && distance(ally.values.position as unknown as Point, state.economy!.storePosition) > 2) add(`rescue-${ally.id}`, 'RESCUE', ally.id, {}, { expected_ally_help: 1, knowledge_confidence: ally.confidence, urgency: 1, known_reachable: 1 });
    if (Number(ally.values.hp) < Number(ally.values.maxHp)) add(`heal-${ally.id}`, 'HEAL', ally.id, {}, { expected_ally_help: 1 - Number(ally.values.hp) / Number(ally.values.maxHp), food_cost_norm: 2 / 5, knowledge_confidence: ally.confidence, known_reachable: 1, urgency: .8 });
  }
  const alert=state.wildlife?.ecology.tide?.alert;
  const knowsAlarm=alert&&alert.severity>0&&Object.values(knowledge.evidence).some(e=>e.kind==='wildlife.warning'&&e.facts.tideId===state.wildlife!.ecology.tide!.id);
  const gate=state.combat.fenceGeometry.gatePosition;
  const guard=Object.values(state.institutions??{}).some(r=>r.kind==='guard-duty'&&r.members.includes(actorId)&&r.effectiveAt<=state.elapsed&&state.elapsed<r.expiresAt);
  if(knowsAlarm&&guard&&gate&&state.combat.gateOpen&&distance(actor.position,gate)<=18&&!fenceBlocksSegment(state,actor.position,gate))add('wildlife-guard-gate','GUARD',undefined,{...gate},{known_reachable:1,knowledge_confidence:1,urgency:1,personal_goal_alignment:1});
  const home=state.economy!.storePosition,gapHome=distance(actor.position,home);
  if(knowsAlarm&&!enemies.length&&gapHome>8){const d=Math.min(18,gapHome-3),p={x:actor.position.x+(home.x-actor.position.x)/gapHome*d,y:actor.position.y+(home.y-actor.position.y)/gapHome*d};if(!fenceBlocksSegment(state,actor.position,p))add('wildlife-shelter','SEEK_SHELTER',undefined,p,{known_reachable:1,knowledge_confidence:1,urgency:1,expected_self_risk:0});}
  const store = state.economy!.storePosition;
  if (actor.body.hp < actor.body.maxHp && distance(actor.position, store) <= 2 && Number(knowledge.entities['inventory:public']?.values.known_free_food_log ?? 0) >= 2) add('heal-self', 'HEAL', actorId, {}, { expected_ally_help: 0, knowledge_confidence: 1, known_reachable: 1, urgency: 1 - actor.body.hp / actor.body.maxHp });
  if (distance(actor.position, store) > 2 && distance(actor.position, store) <= 20 && !fenceBlocksSegment(state, actor.position, store)) add('retreat-home', 'RETREAT', undefined, { ...store }, { expected_self_risk: 0, known_reachable: 1, knowledge_confidence: 1, urgency: enemies.length && actor.body.hp / actor.body.maxHp < .3 ? 1 : 0 });
  return candidates;
}
