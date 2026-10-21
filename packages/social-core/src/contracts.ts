import { digest, ensure, record } from '../../action-runtime/src/json';
import { validId, type ActionCommand } from '../../action-runtime/src/types';
import type { Agreement, ConsentRecord, SocialPlan, SocialProposal } from './types';
import { resolveCapability } from './capabilities';
export type ProposalValidation = { ok: true; proposal: SocialProposal } | { ok: false; errors: string[] };
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(k => allowed.includes(k));
export function validateProposalShape(input: unknown): ProposalValidation {
  try {
    ensure(record(input) && keys(input, ['schemaVersion', 'id', 'actorId', 'issueId', 'version', 'basisRefs', 'parties', 'terms', 'readSet', 'speech']), 'Unknown proposal fields');
    ensure(input.schemaVersion === 1 && validId(input.id) && input.id.length <= 48 && validId(input.actorId) && validId(input.issueId)
      && Number.isSafeInteger(input.version) && (input.version as number) >= 1, 'Invalid proposal identity');
    ensure(Array.isArray(input.parties) && input.parties.length > 0 && input.parties.length <= 11 && input.parties.every(validId)
      && new Set(input.parties).size === input.parties.length && input.parties.includes(input.actorId), 'Invalid independent parties');
    ensure(Array.isArray(input.basisRefs) && input.basisRefs.length > 0 && input.basisRefs.every(validId), 'Proposal evidence required');
    ensure(record(input.readSet) && Object.entries(input.readSet).every(([id, version]) => validId(id) && Number.isSafeInteger(version) && (version as number) >= 0), 'Invalid proposal readSet');
    ensure(typeof input.speech === 'string' && input.speech.length <= 1000, 'Invalid proposal text');
    const terms = input.terms, parties = input.parties;
    ensure(record(terms) && keys(terms, ['steps', 'deadline']) && (terms.deadline === null || typeof terms.deadline === 'number' && Number.isFinite(terms.deadline) && terms.deadline >= 0)
      && Array.isArray(terms.steps) && terms.steps.length > 0 && terms.steps.length <= 16, 'Invalid proposal terms');
    for (const step of terms.steps) {
      ensure(record(step) && keys(step, ['capability', 'version', 'actorId', 'targetId', 'parameters']) && typeof step.capability === 'string'
        && typeof step.version === 'string' && validId(step.actorId) && parties.includes(step.actorId) && (step.targetId === undefined || validId(step.targetId)), 'Invalid proposal step');
      const capability = resolveCapability(step.capability, step.version);
      ensure(capability && capability.parametersValid(step.parameters), 'Unknown capability or invalid parameters');
      if(['TRANSFER','FOLLOW','ESCORT','SOCIAL_VISIT'].includes(step.capability))ensure(typeof step.targetId==='string'&&parties.includes(step.targetId),'Bilateral action requires recipient consent');
    }
    digest(input); return { ok: true, proposal: structuredClone(input) as unknown as SocialProposal };
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : 'Invalid proposal'] }; }
}
export function proposalTermsHash(proposal: SocialProposal) {
  return digest({ schemaVersion: proposal.schemaVersion, id: proposal.id, actorId: proposal.actorId, issueId: proposal.issueId,
    version: proposal.version, basisRefs: proposal.basisRefs, parties: proposal.parties, terms: proposal.terms });
}
function allConsented(proposal: SocialProposal, records: ConsentRecord[]) {
  const hash = proposalTermsHash(proposal);
  return proposal.parties.every(actorId => records.filter(r => r.actorId === actorId && r.proposalId === proposal.id
    && r.proposalVersion === proposal.version && r.termsHash === hash).at(-1)?.response === 'accept');
}
export function activatePlan(proposal: SocialProposal, records: ConsentRecord[]): { plan: SocialPlan; agreement: Agreement } {
  ensure(validateProposalShape(proposal).ok && allConsented(proposal, records), 'Missing independent consent for exact terms');
  const agreement: Agreement = { id: `${proposal.id}:agreement`, proposalId: proposal.id, termsHash: proposalTermsHash(proposal), parties: [...proposal.parties], status: 'accepted', evidenceRefs: [] };
  const plan: SocialPlan = { id: `${proposal.id}:plan`, proposalId: proposal.id, steps: structuredClone(proposal.terms.steps), agreementIds: [agreement.id], status: 'active', readSet: { ...proposal.readSet } };
  return { plan, agreement };
}
export function planCommands(plan: SocialPlan, proposal: SocialProposal, records: ConsentRecord[]): ActionCommand[] {
  const expected = activatePlan(proposal, records).plan;
  ensure(plan.status === 'active' && digest(plan) === digest(expected), 'Plan does not match consented proposal');
  return plan.steps.map((step, index) => ({ operationId: `${plan.id}:step${index}`, actorId: step.actorId, action: resolveCapability(step.capability, step.version)!.action,
    parameters: structuredClone(step.parameters), ...(step.targetId ? { targetId: step.targetId } : {}), readSet: { ...plan.readSet }, source: 'active_plan', planId: plan.id }));
}
