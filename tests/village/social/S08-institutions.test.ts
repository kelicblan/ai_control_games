import { expect, it } from 'vitest';
import { applyInstitution, institutionHash, authorizeResourceUse } from '../../../packages/social-core/src/institutions';
it('needs independent exact-term consent and grants only bounded future use rights', () => {
  const change = { id: 'borrow-rule', version: 1, kind: 'equipment-use' as const, issuerId: 'a', members: ['a', 'b'], itemIds: ['bow'], effectiveAt: 10, expiresAt: 20, basisRefs: ['e'] };
  expect(applyInstitution(change, [], {}).ok).toBe(false);
  const consents = change.members.map(actorId => ({ actorId, termsHash: institutionHash(change), response: 'accept' as const }));
  const result = applyInstitution(change, consents, {}); expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(authorizeResourceUse(result.rules, 'b', 'bow', 9).allowed).toBe(false);
  expect(authorizeResourceUse(result.rules, 'b', 'bow', 11).allowed).toBe(true);
  expect(authorizeResourceUse(result.rules, 'captain-archetype', 'bow', 11).allowed).toBe(false);
  expect(authorizeResourceUse(result.rules, 'b', 'bow', 20).allowed).toBe(false);
  expect(applyInstitution(change, consents, result.rules).rules).toEqual(result.rules);
});
