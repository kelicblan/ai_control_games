import { activatePlan, planCommands } from '../../../../../packages/social-core/src/contracts';
import { activateAgreement, agreementEvidence, verifyEquipmentAgreement } from '../../../../../packages/social-core/src/agreement';
import { submitCommand,cancelExecution } from '../systems/commands';
import type { VillageState } from '../domain/types';
import { digest, ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { observePersonalEvent } from '../../../../../packages/social-core/src/knowledge';
export function activateSocialPlan(state: VillageState, proposalId: string) {
  const proposal = state.social.proposals[proposalId]; ensure(proposal, 'Unknown social proposal');
  const { plan } = activatePlan(proposal, state.social.consents), agreement = activateAgreement(proposal, state.social.consents);
  const existing = state.social.agreements[agreement.id];
  if (existing && existing.status !== 'waiting_conditions') return existing;
  const next = structuredClone(state);
  next.social.plans[plan.id] = plan; next.social.agreements[agreement.id] = agreement;
  const receipts = planCommands(plan, proposal, state.social.consents).filter((command, index, commands) => commands.findIndex(c => c.actorId === command.actorId) === index).map(command => {
    // Consent binds terms; availability and public stock are re-read when a future condition becomes true.
    command.readSet = Object.fromEntries(Object.entries(command.readSet).map(([key, version]) => [key, key === 'inventory:public' || proposal.parties.some(id => key === `actor:${id}`) ? next.versions[key] : version]));
    return submitCommand(next, command);
  });
  if (receipts.some(r => !r.accepted)) {
    agreement.status = 'waiting_conditions'; agreement.conditionHash = conditionHash(state, proposalId); state.social.plans[plan.id] = plan; state.social.agreements[agreement.id] = agreement;
  } else {
    next.social.agreements[agreement.id].status = 'executing';
    for(const previous of Object.values(next.social.agreements))if(previous.id!==agreement.id&&previous.reason==='change-requested'&&next.social.proposals[previous.proposalId].issueId===proposal.issueId&&previous.parties.every(id=>proposal.parties.includes(id))){
      previous.status='cancelled';const oldPlan=Object.values(next.social.plans).find(p=>p.agreementIds.includes(previous.id));if(oldPlan){oldPlan.status='cancelled';for(const task of Object.values(next.executions))if(task.command.planId===oldPlan.id&&['accepted','running'].includes(task.status))cancelExecution(next,task.id,task.command.actorId,`${task.id}:superseded`);}
      appendEvent(next,'agreement.superseded',previous.parties,{previousAgreementId:previous.id,agreementId:agreement.id});
    }
    Object.assign(state, next);
  }
  return state.social.agreements[agreement.id];
}
function conditionHash(state: VillageState, proposalId: string) {
  const proposal = state.social.proposals[proposalId];
  return digest({ versions: Object.fromEntries([...proposal.parties.map(id => `actor:${id}`), 'inventory:public'].map(id => [id, state.versions[id]])),
    items: proposal.terms.steps.map(step => typeof step.parameters.itemId === 'string' ? state.economy?.items[step.parameters.itemId] ?? null : null) });
}
export function updateAgreements(state: VillageState) {
  for (const agreement of Object.values(state.social.agreements)) {
    if (['cancelled', 'breached', 'fulfilled'].includes(agreement.status)) continue;
    if (agreement.status === 'waiting_conditions' && agreement.conditionHash !== conditionHash(state, agreement.proposalId)) activateSocialPlan(state, agreement.proposalId);
    const current = state.social.agreements[agreement.id];
    const activePlan = Object.values(state.social.plans).find(p => p.agreementIds.includes(agreement.id));
    if (activePlan && ['executing', 'partial'].includes(current.status) && current.reason !== 'change-requested') {
      const proposal = state.social.proposals[current.proposalId];
      const commands = planCommands(activePlan, proposal, state.social.consents);
      const occupied = new Set<string>();
      for (const command of commands) {
        const operation = state.operations[command.operationId], task = operation?.receipt.executionId ? state.executions[operation.receipt.executionId] : undefined;
        if (task?.status === 'completed') continue;
        if (occupied.has(command.actorId)) continue;
        occupied.add(command.actorId);
        if (task) {
          if (['failed', 'interrupted', 'cancelled'].includes(task.status)) current.reason = task.status === 'interrupted' ? 'physical-incapacity' : task.status === 'cancelled' ? 'voluntary-exit' : 'execution-blocked';
          continue;
        }
        if (current.reason) continue;
        command.readSet = Object.fromEntries(Object.entries(command.readSet).map(([key, version]) => [key, key === 'inventory:public' || proposal.parties.some(id => key === `actor:${id}`) ? state.versions[key] : version]));
        // A rejected attempt is not kept: conditions may become true later, with the SAME obligation ID.
        const next = structuredClone(state), receipt = submitCommand(next, command);
        if (receipt.accepted) Object.assign(state, next);
      }
      const updated = state.social.agreements[agreement.id];
      updated.evidenceRefs = agreementEvidence(updated, state.events);
      if (updated.evidenceRefs.length && updated.evidenceRefs.length < (updated.obligations?.length ?? 0)) updated.status = 'partial';
    }
    // The executor commits clones. Always re-read the agreement after issuing a step.
    const latest = state.social.agreements[agreement.id];
    Object.assign(agreement, latest);
    state.social.agreements[agreement.id] = agreement;
    if (agreement.status === 'fulfilled' || !agreement.obligations?.length) continue;
    if (verifyEquipmentAgreement(agreement, state.events) !== 'fulfilled') continue;
    agreement.status = 'fulfilled'; agreement.evidenceRefs = agreementEvidence(agreement, state.events);
    const plan = Object.values(state.social.plans).find(p => p.agreementIds.includes(agreement.id)); if (plan) plan.status = 'completed';
    const event = appendEvent(state, 'agreement.fulfilled', agreement.parties, { agreementId: agreement.id, evidenceRefs: agreement.evidenceRefs });
    for (const party of agreement.parties) state.actors[party].personal.knowledge = observePersonalEvent(party, event, state.actors[party].personal.knowledge);
    for (const obligation of agreement.obligations) if (obligation.kind === 'equipment' && obligation.recipientId) {
      const recipient = state.actors[obligation.recipientId];
      const relation = recipient.personal.relations[obligation.actorId] ??= { targetId: obligation.actorId, trust: .5, affinity: .5, reciprocity: .5, rivalry: .5, authority: .5, basisRefs: [] };
      relation.trust = Math.min(1, relation.trust + .05); relation.reciprocity = Math.min(1, relation.reciprocity + .05); relation.basisRefs.push(event.id);
    }
  }
}

export function requestPlanChange(state: VillageState, actorId: string, agreementId: string) {
  const agreement = state.social.agreements[agreementId]; ensure(agreement && agreement.parties.includes(actorId) && !['fulfilled', 'cancelled'].includes(agreement.status), 'Cannot request plan change');
  agreement.reason = 'change-requested';
  const proposal = state.social.proposals[agreement.proposalId], issue = state.social.issues[proposal.issueId];
  issue.status = 'waiting'; issue.waitingForPlayer = actorId !== state.playerId && issue.participants.includes(state.playerId);
  delete issue.attempts;issue.retryAfter=state.elapsed;
  return appendEvent(state, 'plan.change_requested', agreement.parties, { actorId, agreementId, previousTermsHash: agreement.termsHash });
}
