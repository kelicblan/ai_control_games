import { expect, it } from 'vitest';
import { reviseProposal, verifyPlan } from '../../../packages/social-core/src/plans';
import type { SocialProposal, SocialPlan } from '../../../packages/social-core/src/types';
it('revisions preserve original promise and require fresh consent for a distinct proposal', () => {
  const p: SocialProposal = { schemaVersion: 1, id: 'p', actorId: 'a', issueId: 'issue', version: 1, basisRefs: ['e'], parties: ['a'], terms: { steps: [{ capability: 'REST', version: '1', actorId: 'a', parameters: { seconds: 5 } }], deadline: null }, readSet: {}, speech: '' };
  const r = reviseProposal(p, 1, { deadline: 20 }); expect(r.ok).toBe(true);
  if (r.ok) { expect(r.proposal.id).not.toBe(p.id); expect(r.proposal.version).toBe(2); }
  expect(p.terms.deadline).toBe(null); expect(reviseProposal(p, 2, {} ).ok).toBe(false);
});
it('keeps remaining sequential obligations and verifies exact operations', () => {
  const plan: SocialPlan = { id: 'p:plan', proposalId: 'p', status: 'active', agreementIds: ['p:agreement'], readSet: {}, steps: [{ capability: 'REST', version: '1', actorId: 'a', parameters: { seconds: 1 } }, { capability: 'REST', version: '1', actorId: 'a', parameters: { seconds: 2 } }] };
  const e = { id: 'e', at: 1, kind: 'execution.completed', participants: ['a'], visibleTo: ['a'], facts: { action: 'REST', planId: plan.id, operationId: 'p:plan:step0' } };
  expect(verifyPlan(plan, [e])).toEqual({ status: 'partial', completedSteps: [0], remainingSteps: [1], evidenceRefs: ['e'] });
  expect(verifyPlan(plan, [{ ...e, facts: { ...e.facts, operationId: 'other' } }]).status).toBe('pending');
});
