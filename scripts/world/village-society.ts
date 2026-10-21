import { ensureIssue } from '../../packages/social-core/src/issues';
import { buildSocialContext, requestSocialProposal, respondSocialProposal, type SocialGenerator } from '../../src/games/camp/village/social/context';
import type { VillageState } from '../../src/games/camp/village/domain/types';
import { appendEvent } from '../../packages/action-runtime/src/runtime';
import { observePersonalEvent } from '../../packages/social-core/src/knowledge';
import { distance } from '../../src/games/camp/village/systems/resources';
import { digest } from '../../packages/action-runtime/src/json';
import { proposeGoalRevision } from '../../src/games/camp/village/social/reflection';
export function socialSemanticSignature(state: VillageState, issueId: string) {
  const issue = state.social.issues[issueId];
  return digest(issue.participants.map(id => {
    const actor = state.actors[id]; if (!actor) return { id, missing: true };
    return { id, body:{hp:actor.body.hp,maxHp:actor.body.maxHp,downed:actor.body.downed,incapacitated:actor.body.incapacitated,needsRest:actor.body.energy<45,needsFood:actor.body.hunger>=10},nearby:issue.participants.filter(other=>other!==id).map(other=>({id:other,withinReach:!!state.actors[other]&&distance(actor.position,state.actors[other].position)<=2})),carried:actor.carried, personality: actor.personality, goals: actor.personal.goals,relations:actor.personal.relations,institutions:Object.values(state.institutions??{}).filter(r=>r.members.includes(id)&&r.effectiveAt<=state.elapsed&&state.elapsed<r.expiresAt),
      basis: issue.basisRefs.map(ref => actor.personal.knowledge.evidence[ref] ?? null),
      items: Object.values(state.economy?.items ?? {}).filter(item => item.ownerId === id || item.holderId === id).sort((a, b) => a.id.localeCompare(b.id)) };
  }));
}
/** Existing service process; model requests run outside the SQLite transaction. */
export function openVillageIssue(state: VillageState, actorId: string) {
  const actor = state.actors[actorId]; if (!state.economy || !actor || actor.body.downed || actor.body.incapacitated) return null;
  const change=Object.values(state.social.agreements).find(a=>a.reason==='change-requested'&&a.parties[0]===actorId&&a.status!=='cancelled');
  if(change){const issue=state.social.issues[state.social.proposals[change.proposalId].issueId];if(issue.status==='waiting'&&!issue.waitingForPlayer&&(issue.retryAfter??0)<=state.elapsed&&(issue.attempts??0)<3){issue.status='negotiating';issue.revision++;issue.attempts=(issue.attempts??0)+1;issue.leaseUntil=state.elapsed+240;return issue;}}
  const item = Object.values(state.economy.items).find(i => i.ownerId === actorId && i.holderId === actorId && i.recipeId === 'WPN005' && i.equippedBy === null);
  const observedNeed = state.ruleVersion === 'p4-social-content-v1' && Object.values(actor.personal.knowledge.entities).some(e => (e.kind === 'enemy' && Number(e.values.hp)>0 || e.kind === 'ally' && Number(e.values.hp)<Number(e.values.maxHp)) && state.elapsed-e.at<=5);
  const peer = (item || observedNeed) && Object.values(state.actors).find(p => p.id !== actorId && !p.body.downed && !p.body.incapacitated && distance(p.position, actor.position) <= 2);
  if (actor.body.energy >= 45 && !peer) return null;
  const reason = peer ? item ? `equipment:${item.id}` : `risk:${Object.keys(state.combat?.waves??{}).at(-1)??'observed'}` : `rest:${Math.floor(actor.body.energy / 10)}`;
  const participants = peer ? [actorId, peer.id] : [actorId];
  const reasonKey = digest({ protocol:'bounded-social-v2',actorId, reason, participants: [...participants].sort() });
  const existing = Object.values(state.social.issues).find(i => i.reasonKey === reasonKey);
  if (existing) {
    if (existing.waitingForPlayer) return null;
    if ((existing.attempts ?? 1) >= 3 || !['open','waiting', 'negotiating'].includes(existing.status)
      || existing.status === 'waiting' && (existing.retryAfter ?? 0) > state.elapsed
      || existing.status === 'negotiating' && (existing.leaseUntil ?? Infinity) > state.elapsed) return null;
    existing.status = 'negotiating'; existing.revision++; existing.attempts = (existing.attempts ?? 1) + 1; existing.leaseUntil = state.elapsed + 240;
    return existing;
  }
  if (Object.values(state.social.issues).some(i => i.participants.includes(actorId) && i.status === 'negotiating')) return null;
  // Ground the issue in a real self observation; never claims that a promise was fulfilled.
  const event = appendEvent(state, 'need.observed', [actorId], { reason, energy: actor.body.energy, itemId: item?.id ?? null });
  actor.personal.knowledge = observePersonalEvent(actorId, event, actor.personal.knowledge);
  const issue = ensureIssue(state.social.issues, { actorId, reason, participants: peer ? [actorId, peer.id] : [actorId], basisRefs: [event.id] });
  issue.reasonKey = reasonKey;
  issue.status = 'negotiating';
  issue.attempts = 1; issue.leaseUntil = state.elapsed + 240;
  return issue;
}
export async function resolveVillageIssue(state: VillageState, issueId: string, generate: SocialGenerator) {
  const issue = state.social.issues[issueId], actorId = issue.participants[0], actor = state.actors[actorId];
  const context = buildSocialContext(actorId, issue, actor.personal.knowledge, state);
  const finish=async(proposal:string|null,reason:string|null)=>({proposal,reason,goalRevision:state.ruleVersion==='p4-social-content-v1'?await proposeGoalRevision(state,actorId,generate).catch(()=>null):null});
  const proposal = await requestSocialProposal(state, context, generate);
  if (!proposal.ok) { issue.status = 'waiting'; issue.retryAfter = state.elapsed + 10 * 2 ** ((issue.attempts ?? 1) - 1); return finish(null,proposal.errors.join('; ')); }
  state.social.proposals[proposal.proposal.id] = proposal.proposal;
  for (const party of proposal.proposal.parties) {
    if (party === state.playerId) { issue.status = 'waiting'; issue.waitingForPlayer = true; return finish(proposal.proposal.id,'Waiting for human player response'); }
    const consent = await respondSocialProposal(state, party, proposal.proposal, generate);
    if (!consent.accepted || consent.consent?.response !== 'accept') { issue.status = 'rejected'; return finish(proposal.proposal.id,'A party declined or response was invalid'); }
  }
  issue.status = 'agreed';
  return finish(proposal.proposal.id,null);
}
