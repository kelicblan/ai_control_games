import { validateProposalShape, type ProposalValidation } from './contracts';
import type { SocialProposal, SocialPlan, PlanStep } from './types';
import type { DomainEvent } from '../../action-runtime/src/types';
export function reviseProposal(proposal: SocialProposal, expectedVersion: number, patch: { steps?: PlanStep[]; deadline?: number | null }): ProposalValidation {
  if (expectedVersion !== proposal.version || Object.keys(patch).some(k => !['steps', 'deadline'].includes(k))) return { ok: false, errors: ['Revision conflict or forbidden patch'] };
  return validateProposalShape({ ...structuredClone(proposal), id: `${proposal.id}:v${proposal.version + 1}`, version: proposal.version + 1, terms: { ...structuredClone(proposal.terms), ...structuredClone(patch) } });
}
export function verifyPlan(plan: SocialPlan, events: readonly DomainEvent[]) {
  const completedSteps: number[] = [], remainingSteps: number[] = [], evidenceRefs: string[] = [];
  plan.steps.forEach((step, index) => {
    const event = events.find(e => e.kind === 'execution.completed' && e.facts.planId === plan.id && e.facts.operationId === `${plan.id}:step${index}` && e.facts.action === step.capability && e.participants.includes(step.actorId));
    if (event) { completedSteps.push(index); evidenceRefs.push(event.id); } else remainingSteps.push(index);
  });
  return { status: remainingSteps.length === 0 ? 'fulfilled' as const : completedSteps.length ? 'partial' as const : 'pending' as const, completedSteps, remainingSteps, evidenceRefs };
}
