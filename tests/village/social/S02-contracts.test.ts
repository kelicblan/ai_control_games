import { describe, expect, it } from 'vitest';
import { validateProposalShape, proposalTermsHash, activatePlan, planCommands } from '../../../packages/social-core/src/contracts';
import { recordConsent } from '../../../packages/social-core/src/consent';
import type { ConsentRecord, SocialProposal } from '../../../packages/social-core/src/types';
const proposal: SocialProposal = { schemaVersion: 1, id: 'proposal-1', actorId: 'a', issueId: 'issue-1', version: 1, basisRefs: ['e1'], parties: ['a', 'b'],
  terms: { steps: [{ capability: 'WAIT', version: '1', actorId: 'a', parameters: { seconds: .2 } }], deadline: 10 }, readSet: {}, speech: '等一会儿再商量。' };
const accept = (actorId: string, operationId = actorId): ConsentRecord => ({ actorId, proposalId: proposal.id, proposalVersion: 1, termsHash: proposalTermsHash(proposal), response: 'accept', operationId });
describe('S02 structured proposals, independent consent and one executor', () => {
  it('rejects unknown capabilities, SQL, undeclared participants and malformed parameters', () => {
    expect(validateProposalShape(proposal).ok).toBe(true);
    expect(validateProposalShape({ ...proposal, sql: 'UPDATE inventory' }).ok).toBe(false);
    expect(validateProposalShape({ ...proposal, terms: { ...proposal.terms, steps: [{ ...proposal.terms.steps[0], capability: 'SQL' }] } }).ok).toBe(false);
    expect(validateProposalShape({ ...proposal, parties: ['b'] }).ok).toBe(false);
    expect(validateProposalShape({ ...proposal, terms: { ...proposal.terms, steps: [{ ...proposal.terms.steps[0], parameters: { seconds: -1 } }] } }).ok).toBe(false);
  });
  it('binds each individual consent to terms/version and deduplicates operations', () => {
    const first = recordConsent(accept('a'), proposal, []); expect(first.accepted).toBe(true);
    expect(recordConsent(accept('a'), proposal, first.records).records).toEqual(first.records);
    expect(() => activatePlan(proposal, first.records)).toThrow(/consent/);
    const changed = structuredClone(proposal); changed.version = 2; changed.terms.steps[0].parameters.seconds = 1;
    expect(recordConsent(accept('b'), changed, first.records).accepted).toBe(false);
    expect(() => activatePlan(changed, first.records)).toThrow();
    expect(recordConsent({ ...accept('a'), response: 'decline' }, proposal, first.records).accepted).toBe(false);
  });
  it('generates ActionCommands only after all parties agree without settling any resources', () => {
    const a = recordConsent(accept('a'), proposal, []), b = recordConsent(accept('b'), proposal, a.records);
    const result = activatePlan(proposal, b.records);
    expect(result.agreement.status).toBe('accepted'); expect(result.plan.status).toBe('active');
    const commands = planCommands(result.plan, proposal, b.records);
    expect(commands).toEqual([expect.objectContaining({ actorId: 'a', action: 'WAIT', source: 'active_plan', planId: result.plan.id, parameters: { seconds: .2 } })]);
    expect(result).not.toHaveProperty('inventory'); expect(result.agreement.evidenceRefs).toEqual([]);
  });
});
