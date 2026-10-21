import { expect, it } from 'vitest';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { activateSocialPlan } from '../../src/games/camp/village/social/adapter';
import { proposalTermsHash } from '../../packages/social-core/src/contracts';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import type { SocialProposal } from '../../packages/social-core/src/types';
import { createOrder } from '../../src/games/camp/village/systems/orders';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
function scenario(capability: 'REST' | 'TRANSFER') {
  const state = createVillageState(rules, { id: 'agreement', classification: 'fixture', worldId: 'agreement', seed: 17, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: {} }); initializeEconomy(state, rules);
  state.actors.a.body.energy = 20;
  state.actors.a.personal.knowledge.evidence.e1 = { eventId: 'e1', at: 0, kind: 'self.observed', source: 'observed', facts: {} };
  const p: SocialProposal = { schemaVersion: 1, id: 'p', actorId: 'a', issueId: 'i', version: 1, basisRefs: ['e1'], parties: ['a', 'player'], terms: { steps: [{ capability, version: '1', actorId: 'a', ...(capability === 'TRANSFER' ? { targetId: 'player' } : {}), parameters: capability === 'REST' ? { seconds: 5 } : { itemId: 'future-item' } }], deadline: null }, readSet: {}, speech: '商量' };
  state.social.issues.i = { id: 'i', participants: p.parties, revision: 1, status: 'agreed', basisRefs: ['e1'] }; state.social.proposals.p = p;
  state.social.consents = p.parties.map(actorId => ({ actorId, proposalId: p.id, proposalVersion: 1, termsHash: proposalTermsHash(p), operationId: `consent-${actorId}`, response: 'accept' }));
  return state;
}
it('persists actual rest fulfilment without instant energy or duplicate success', () => {
  const state = scenario('REST'); const agreement = activateSocialPlan(state, 'p'); expect(state.actors.a.body.energy).toBe(20);
  state.paused = false; for (let i = 0; i < 51; i++) advanceVillage(state);
  expect(state.social.agreements[agreement.id].status).toBe('fulfilled'); expect(state.actors.a.body.energy).toBe(30);
  expect(state.events.filter(e => e.kind === 'agreement.fulfilled')).toHaveLength(1);
  expect(restoreVillageState(JSON.parse(JSON.stringify(state)), rules)).toEqual(state);
});
it('keeps future-item agreements waiting without accepting an impossible transfer', () => {
  const state = scenario('TRANSFER'); expect(activateSocialPlan(state, 'p').status).toBe('waiting_conditions');
  expect(state.executions).toEqual({}); expect(state.reservations).toEqual({}); expect(state.inventory).toEqual({});
  expect(restoreVillageState(state, rules)).toEqual(state);
});
it('fulfils an equipment promise only after a real crafted bow changes ownership', () => {
  const state = scenario('TRANSFER'); state.inventory = { wood: 14, stone: 4, rope: 5, food: 10 };
  const receipt = createOrder(state, { operationId: 'make-bow', actorId: 'a', kind: 'craft', recipeId: 'WPN005', recipientId: 'player' }); expect(receipt.accepted).toBe(true);
  state.paused = false; for (let i = 0; i < 2000 && state.executions[receipt.executionId!].status !== 'completed'; i++) advanceVillage(state);
  const item = Object.values(state.economy!.items)[0]; expect(item.recipeId).toBe('WPN005');
  const proposal = state.social.proposals.p; proposal.terms.steps[0].parameters.itemId = item.id;
  state.social.consents = proposal.parties.map(actorId => ({ actorId, proposalId: proposal.id, proposalVersion: proposal.version, termsHash: proposalTermsHash(proposal), operationId: `equipment-consent-${actorId}`, response: 'accept' }));
  const agreement = activateSocialPlan(state, proposal.id); expect(agreement.status).toBe('executing'); expect(state.economy!.items[item.id].ownerId).toBe('a');
  advanceVillage(state); advanceVillage(state);
  expect(state.social.agreements[agreement.id].status).toBe('fulfilled'); expect(state.economy!.items[item.id].ownerId).toBe('player');
  expect(state.actors.player.personal.relations.a.trust).toBe(.55);
  expect(state.events.filter(e => e.kind === 'agreement.fulfilled')).toHaveLength(1);
  expect(restoreVillageState(JSON.parse(JSON.stringify(state)), rules)).toEqual(state);
});
