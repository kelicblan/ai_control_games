import { canonical, ensure, record } from '../../action-runtime/src/json';
import { validId } from '../../action-runtime/src/types';
import { activatePlan, proposalTermsHash, validateProposalShape } from './contracts';
import { recordConsent } from './consent';
import type { ConsentRecord, SocialProposal } from './types';
import type { Agreement } from './types';
import type { DomainEvent } from '../../action-runtime/src/types';
import { activateAgreement, agreementEvidence, verifyEquipmentAgreement } from './agreement';
/** P1 persists only protocol states that the implemented activation flow can produce. */
export function validateSocialPersistence(value: unknown, actorIds: string[], evidence: (actor: string, ref: string) => boolean, events: readonly DomainEvent[] = []): void {
  ensure(record(value) && record(value.proposals) && Array.isArray(value.consents) && record(value.plans) && record(value.agreements) && record(value.issues), 'Invalid social protocols');
  const proposals = value.proposals, issues = value.issues, agreements = value.agreements;
  const party = (id: unknown): id is string => typeof id === 'string' && actorIds.includes(id);
  for (const [id, issue] of Object.entries(issues)) {
    ensure(validId(id) && record(issue) && issue.id === id && Array.isArray(issue.participants) && issue.participants.length > 0
      && new Set(issue.participants).size === issue.participants.length && issue.participants.every(party)
      && ['open', 'negotiating', 'waiting', 'agreed', 'rejected', 'closed'].includes(String(issue.status))
      && Number.isSafeInteger(issue.revision) && (issue.revision as number) >= 0 && Array.isArray(issue.basisRefs)
      && issue.basisRefs.every(ref => validId(ref) && (issue.participants as string[]).some(actor => evidence(actor, ref))), 'Invalid social issue');
    ensure((issue.waitingForPlayer === undefined || typeof issue.waitingForPlayer === 'boolean') && (issue.attempts === undefined || Number.isSafeInteger(issue.attempts) && (issue.attempts as number) >= 1 && (issue.attempts as number) <= 3)
      && [issue.retryAfter, issue.leaseUntil].every(v => v === undefined || typeof v === 'number' && Number.isFinite(v) && v >= 0), 'Invalid issue retry state');
  }
  for (const [id, raw] of Object.entries(proposals)) {
    const result = validateProposalShape(raw); ensure(result.ok, 'Invalid saved proposal');
    const proposal = result.proposal!;
    ensure(id === proposal.id && proposal.parties.every(party) && proposal.basisRefs.every(ref => evidence(proposal.actorId, ref)), 'Invalid saved proposal parties or evidence');
    const issue = issues[proposal.issueId];
    ensure(record(issue) && Array.isArray(issue.participants) && proposal.parties.every(id => (issue.participants as string[]).includes(id)), 'Missing proposal issue');
  }
  let records: ConsentRecord[] = [];
  for (const raw of value.consents) {
    ensure(record(raw) && party(raw.actorId) && typeof raw.proposalId === 'string' && Object.hasOwn(proposals, raw.proposalId), 'Invalid saved consent');
    const receipt = recordConsent(raw as unknown as ConsentRecord, proposals[raw.proposalId] as unknown as SocialProposal, records);
    ensure(receipt.accepted && receipt.records.length === records.length + 1, 'Invalid or duplicate saved consent'); records = receipt.records;
  }
  for (const [id, agreement] of Object.entries(agreements)) {
    ensure(record(agreement) && typeof agreement.proposalId === 'string' && Object.hasOwn(proposals, agreement.proposalId), 'Invalid saved agreement');
    const proposal = proposals[agreement.proposalId] as unknown as SocialProposal;
    const expected = agreement.obligations === undefined ? activatePlan(proposal, records).agreement : activateAgreement(proposal, records);
    const status = agreement.status, refs = agreement.evidenceRefs;
    ensure(['accepted', 'waiting_conditions', 'executing', 'partial', 'fulfilled', 'cancelled', 'breached'].includes(String(status)) && Array.isArray(refs), 'Invalid saved agreement lifecycle');
    if (status === 'fulfilled') ensure(verifyEquipmentAgreement({ ...expected, status: 'accepted' }, events) === 'fulfilled' && canonical(refs) === canonical(agreementEvidence(expected, events)), 'Missing fulfilment evidence');
    else ensure(refs.length === 0 || canonical(refs) === canonical(agreementEvidence(expected, events)), 'Invalid partial evidence');
    const { conditionHash: condition, reason, ...content } = agreement;
    ensure(reason === undefined || ['change-requested', 'physical-incapacity', 'voluntary-exit', 'execution-blocked'].includes(String(reason)), 'Invalid agreement reason');
    ensure(condition === undefined || typeof condition === 'string' && /^[a-f0-9]{64}$/.test(condition), 'Invalid agreement condition hash');
    ensure(id === expected.id && agreement.termsHash === proposalTermsHash(proposal) && canonical({ ...content, status: 'accepted', evidenceRefs: [] }) === canonical(expected), 'Agreement does not match consent');
  }
  for (const [id, plan] of Object.entries(value.plans)) {
    ensure(record(plan) && typeof plan.proposalId === 'string' && Object.hasOwn(proposals, plan.proposalId), 'Invalid saved plan');
    const expected = activatePlan(proposals[plan.proposalId] as unknown as SocialProposal, records).plan;
    const linked = agreements[expected.agreementIds[0]] as unknown as Agreement;
    const status = linked?.status === 'fulfilled' ? 'completed' : linked?.status === 'cancelled' ? 'cancelled' : 'active';
    ensure(id === expected.id && plan.status === status && canonical({ ...plan, status: 'active' }) === canonical(expected) && expected.agreementIds.every(key => Object.hasOwn(agreements, key)), 'Plan does not match accepted agreement');
  }
}
