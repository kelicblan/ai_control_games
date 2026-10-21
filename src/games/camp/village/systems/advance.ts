import { ensure } from '../../../../../packages/action-runtime/src/json';
import { observePersonalEvent } from '../../../../../packages/social-core/src/knowledge';
import type { VillageState } from '../domain/types';
import { advanceExecutions } from './commands';
import { tickWorkOrders } from './orders';
import { refreshKnowledge } from './perception';
import { grantExperience } from './progression';
import { selectWorldRules } from '../config/load';
import { supplement } from './resources';
import { updateAgreements } from '../social/adapter';
import { settleDailyFood } from './food';
import { spawnRecruitOffers } from './recruitment';
import { advanceCombat } from './combat-step';
import { appraiseKnownEvent, applyRelationDeltas } from '../social/appraisal';
import { expireUseRights } from '../social/rights';
import { refillFoodSources } from './food-supply';
import { reflectKnownOutcome } from '../social/goal-outcomes';
import { updateMilestones } from './milestones';
export const VILLAGE_STEP_SECONDS = .1;
/** Same step function for the local authority, offline scenarios and replay. */
export function advanceVillage(state: VillageState, dt = VILLAGE_STEP_SECONDS, advance = advanceExecutions) {
  ensure(dt === VILLAGE_STEP_SECONDS, 'Village uses a fixed 100ms simulation step');
  if (state.paused) return [];
  const firstEvent = state.events.length;
  state.tick++; state.elapsed = state.tick * VILLAGE_STEP_SECONDS;
  expireUseRights(state);
  refillFoodSources(state);
  const events = advance(state, dt);
  tickWorkOrders(state, dt);
  advanceCombat(state, dt);
  if (state.economy) {
    const rules = selectWorldRules('village-v1', state.ruleVersion), sources = supplement<{ xpSources: Record<string, number> }>(rules, 'D14').xpSources;
    const cycleTicks = Math.round((rules.clock.daylightSeconds + rules.clock.nightSeconds) / dt);
    if ((state.tick - 1) % cycleTicks === 0) { const day = Math.floor((state.tick - 1) / cycleTicks) + 1; settleDailyFood(state, rules, day); spawnRecruitOffers(state, day); }
    for (const event of events) if (event.kind === 'execution.completed') {
      const action = String(event.facts.action), source = action.startsWith('GATHER_') ? 'gather' : action === 'CRAFT' ? 'craft' : action === 'DEPOSIT' ? 'delivery' : action === 'UPGRADE_FENCE' || action === 'BUILD_WORKSHOP' ? 'build' : action==='REPAIR_FENCE'?'repair':action==='EXPLORE'?'explore':action==='RESCUE'||action==='HEAL'?'rescue':'';
      if (sources[source]) grantExperience(state, event.id, event.participants[0], sources[source]);
    }
    if(sources.combat)for(const event of state.events.slice(firstEvent))if(event.kind==='enemy.died'&&state.actors[event.participants[0]])grantExperience(state,event.id,event.participants[0],sources.combat);
    if(state.tick%5===0||state.events.length>firstEvent)refreshKnowledge(state);
    updateAgreements(state);
  }
  if (state.economy?.workshop || state.economy?.journey) updateMilestones(state);
  const allEvents = state.events.slice(firstEvent);
  for (const event of allEvents) for (const actor of Object.values(state.actors)) {
    actor.personal.knowledge = observePersonalEvent(actor.id, event, actor.personal.knowledge);
    reflectKnownOutcome(actor,event);
    applyRelationDeltas(state, appraiseKnownEvent(actor.id, actor.personal.knowledge, event.id));
  }
  state.revision++; return allEvents;
}
