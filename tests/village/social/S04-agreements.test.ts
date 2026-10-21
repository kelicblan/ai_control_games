import { expect, it } from 'vitest';
import { activateAgreement, verifyEquipmentAgreement } from '../../../packages/social-core/src/agreement';
import { proposalTermsHash } from '../../../packages/social-core/src/contracts';
import type { SocialProposal } from '../../../packages/social-core/src/types';
it('requires an exact item handover and ownership event, never dialogue or crafting alone', () => {
  const p: SocialProposal = { schemaVersion: 1, id: 'give', actorId: 'a', issueId: 'issue', version: 1, basisRefs: ['e1'], parties: ['a', 'b'], terms: { steps: [{ capability: 'TRANSFER', version: '1', actorId: 'a', targetId: 'b', parameters: { itemId: 'bow' } }], deadline: null }, readSet: {}, speech: '给你弓' };
  const agreement = activateAgreement(p, ['a', 'b'].map(actorId => ({ actorId, proposalId: p.id, proposalVersion: 1, termsHash: proposalTermsHash(p), operationId: `accept-${actorId}`, response: 'accept' })));
  expect(verifyEquipmentAgreement(agreement, [{ id: 'speech', kind: 'actor.said', at: 0, participants: ['a', 'b'], visibleTo: ['a', 'b'], facts: { itemId: 'bow' } }])).toBe('accepted');
  const event = { id: 'actual', kind: 'item.handed_over', at: 1, participants: ['a', 'b'], visibleTo: ['a', 'b'], facts: { itemId: 'bow', fromId: 'a', recipientId: 'b', ownershipGranted: true, agreementId: agreement.id } };
  expect(verifyEquipmentAgreement(agreement, [{ ...event, facts: { ...event.facts, recipientId: 'c' } }])).toBe('accepted');
  expect(verifyEquipmentAgreement(agreement, [event])).toBe('fulfilled');
});
