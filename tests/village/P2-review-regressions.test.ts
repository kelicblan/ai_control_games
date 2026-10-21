import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { openVillageIssue, resolveVillageIssue } from '../../scripts/world/village-society';
import { activateSocialPlan } from '../../src/games/camp/village/social/adapter';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { proposalTermsHash } from '../../packages/social-core/src/contracts';
import type { SocialProposal } from '../../packages/social-core/src/types';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
function world() { const s = createVillageState(rules, { id: 'retry', classification: 'fixture', worldId: 'retry', seed: 17, inventory: { food: 10 }, actors: [{ archetypeId: 'W001', instanceId: 'a' }] }); initializeEconomy(s, rules); s.actors.a.body.energy = 20; return s; }
it('retries temporary model failures with a bounded durable delay', async () => {
  const s = world(), issue = openVillageIssue(s, 'a')!; await resolveVillageIssue(s, issue.id, async () => 'invalid JSON');
  expect(openVillageIssue(s, 'a')).toBeNull(); s.elapsed = 30; s.tick = 300;
  expect(openVillageIssue(s, 'a')?.id).toBe(issue.id);
});
it('reconsiders an accepted rest agreement after the actor becomes free', () => {
  const s = world(); const issue = openVillageIssue(s, 'a')!;
  const p: SocialProposal = { schemaVersion: 1, id: 'rest', actorId: 'a', issueId: issue.id, version: 1, basisRefs: issue.basisRefs, parties: ['a'], terms: { steps: [{ capability: 'REST', version: '1', actorId: 'a', parameters: { seconds: 5 } }], deadline: null }, readSet: {}, speech: '休整' };
  s.social.proposals[p.id] = p; s.social.consents = [{ actorId: 'a', proposalId: p.id, proposalVersion: 1, termsHash: proposalTermsHash(p), operationId: 'accept', response: 'accept' }];
  submitCommand(s, { operationId: 'busy', actorId: 'a', action: 'WAIT', parameters: { seconds: .5 }, readSet: {}, source: 'fallback' });
  p.readSet = { 'actor:a': 1 };
  const agreement = activateSocialPlan(s, p.id); expect(agreement.status).toBe('waiting_conditions');
  s.paused = false; for (let i = 0; i < 60; i++) advanceVillage(s);
  expect(s.social.agreements[agreement.id].status).toBe('fulfilled'); expect(s.actors.a.body.energy).toBe(30);
});
it('waits for the human player instead of generating their consent', async () => {
  const s = world(), issue = openVillageIssue(s, 'a')!; issue.participants.push('player'); let calls = 0;
  const result = await resolveVillageIssue(s, issue.id, async () => { calls++; if (calls === 1) return JSON.stringify({ choice: 'rest' }); if (calls === 2) return JSON.stringify({ response: 'accept' }); throw new Error('Model must not speak for the player'); });
  expect(result.reason).toBe('Waiting for human player response'); expect(calls).toBe(2);
  expect(s.social.issues[issue.id].waitingForPlayer).toBe(true);
  expect(s.social.consents.map(c => c.actorId)).toEqual(['a']);
});
