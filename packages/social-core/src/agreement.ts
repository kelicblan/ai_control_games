import type { Agreement, ConsentRecord, SocialProposal } from './types';
import type { DomainEvent } from '../../action-runtime/src/types';
import { activatePlan } from './contracts';
export function activateAgreement(proposal: SocialProposal, consents: ConsentRecord[]): Agreement {
  const agreement = activatePlan(proposal, consents).agreement;
  agreement.obligations = proposal.terms.steps.flatMap<NonNullable<Agreement['obligations']>[number]>((step, index) => step.capability === 'TRANSFER' && step.parameters.rights === undefined
    ? [{ kind: 'equipment' as const, actorId: step.actorId, recipientId: step.targetId!, itemId: String(step.parameters.itemId) }]
    : step.capability === 'REST' ? [{ kind: 'rest' as const, actorId: step.actorId, minimumSeconds: Number(step.parameters.seconds) }] : [{ kind: 'task', actorId: step.actorId, operationId: `${proposal.id}:plan:step${index}`, action: step.capability }]);
  return agreement;
}
export function agreementEvidence(agreement: Agreement, events: readonly DomainEvent[]): string[] {
  const used = new Set<string>();
  return (agreement.obligations ?? []).flatMap(obligation => {
    const event = events.find(e => !used.has(e.id) && e.participants.includes(obligation.actorId) && (obligation.kind === 'task' ? e.kind === 'execution.completed' && e.facts.operationId === obligation.operationId && e.facts.action === obligation.action : e.facts.agreementId === agreement.id)
      && (obligation.kind === 'equipment' ? e.kind === 'item.handed_over' && e.facts.itemId === obligation.itemId && e.facts.fromId === obligation.actorId && e.facts.recipientId === obligation.recipientId && e.facts.ownershipGranted === true && e.participants.includes(obligation.recipientId!)
        : obligation.kind === 'task' || e.kind === 'rest.completed' && typeof e.facts.seconds === 'number' && e.facts.seconds >= obligation.minimumSeconds! && typeof e.facts.afterEnergy === 'number' && typeof e.facts.beforeEnergy === 'number' && e.facts.afterEnergy >= e.facts.beforeEnergy));
    if (event) used.add(event.id);
    return event ? [event.id] : [];
  });
}
export function verifyEquipmentAgreement(agreement: Agreement, events: readonly DomainEvent[]): Agreement['status'] {
  if (!agreement.obligations?.length) return agreement.status;
  return agreementEvidence(agreement, events).length === agreement.obligations.length ? 'fulfilled' : agreement.status;
}
