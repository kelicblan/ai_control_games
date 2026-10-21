import { expect, it } from 'vitest';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { activatePlan, proposalTermsHash } from '../../packages/social-core/src/contracts';
import type { SocialProposal } from '../../packages/social-core/src/types';
const rules = selectWorldRules('village-v1', 'draft-table-v1');
const world = () => createVillageState(rules, { id: 'save', classification: 'fixture', worldId: 'w', seed: 1, actors: [], inventory: {} });
it('rejects counter rewind before IDs can overwrite existing work', () => {
  const state = world(); submitCommand(state, { operationId: 'op', actorId: 'player', action: 'WAIT', parameters: { seconds: 1 }, source: 'scripted_test', readSet: {} });
  state.nextExecution = 1; expect(() => restoreVillageState(state, rules)).toThrow();
  state.nextExecution = 2; state.nextEvent = 1; expect(() => restoreVillageState(state, rules)).toThrow();
});
it('rejects malformed or cross-linked social protocols in persisted state', () => {
  const state = world();
  state.social.consents = [{ actorId: 'ghost', response: 'accept' }] as never;
  expect(() => restoreVillageState(state, rules)).toThrow();
  state.social.consents = []; state.social.plans.fake = { id: 'fake', proposalId: 'missing', status: 'active' } as never;
  expect(() => restoreVillageState(state, rules)).toThrow();
});
it('roundtrips consented WAIT plans and rejects a forged terms hash', () => {
  const state = world(), actor = state.actors.player;
  actor.personal.knowledge.evidence.e1 = { eventId: 'e1', at: 0, kind: 'fixture.observed', source: 'observed', facts: {} };
  state.social.issues.issue = { id: 'issue', participants: ['player'], status: 'agreed', revision: 1, basisRefs: ['e1'] };
  const proposal: SocialProposal = { schemaVersion: 1, id: 'proposal', actorId: 'player', issueId: 'issue', version: 1, basisRefs: ['e1'], parties: ['player'], terms: { steps: [{ capability: 'WAIT', version: '1', actorId: 'player', parameters: { seconds: .2 } }], deadline: null }, readSet: {}, speech: '等待' };
  state.social.proposals.proposal = proposal;
  state.social.consents.push({ actorId: 'player', proposalId: 'proposal', proposalVersion: 1, termsHash: proposalTermsHash(proposal), response: 'accept', operationId: 'consent' });
  const { plan, agreement } = activatePlan(proposal, state.social.consents);
  state.social.plans[plan.id] = plan; state.social.agreements[agreement.id] = agreement;
  expect(restoreVillageState(state, rules)).toEqual(state);
  state.social.consents[0].termsHash = '0'.repeat(64); expect(() => restoreVillageState(state, rules)).toThrow();
});
