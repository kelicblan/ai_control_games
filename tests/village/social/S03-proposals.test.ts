import { expect, it } from 'vitest';
import { buildSocialContext, requestSocialProposal } from '../../../src/games/camp/village/social/context';
import { ensureIssue } from '../../../packages/social-core/src/issues';
import { createVillageState } from '../../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../../src/games/camp/village/config/load';
it('isolates personal prompts, deduplicates reasons, and revalidates relevant reads', async () => {
  const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1'), s = createVillageState(rules, { id: 'social', classification: 'fixture', worldId: 'social', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: {} });
  s.actors.player.personal.knowledge.evidence.e1 = { eventId: 'e1', at: 0, kind: 'self.observed', source: 'observed', facts: { need: 'rest' } };
  const issue = ensureIssue(s.social.issues, { actorId: 'player', reason: 'tired', participants: ['player'], basisRefs: ['e1'] });
  expect(ensureIssue(s.social.issues, { actorId: 'player', reason: 'tired', participants: ['player'], basisRefs: ['e1'] }).id).toBe(issue.id);
  s.actors.a.personal.goals.push({ id: 'secret', actorId: 'a', kind: 'status', priority: 1, progress: 0, basisRefs: [], revision: 1, reconsiderOn: [] });
  const context = buildSocialContext('player', issue, s.actors.player.personal.knowledge, s);
  expect(JSON.stringify(context)).not.toContain('secret');
  const response = async () => JSON.stringify({ choice: 'rest' });
  s.versions.weather = 5; expect((await requestSocialProposal(s, context, response)).ok).toBe(true);
  s.actors.player.body.downed = true; expect((await requestSocialProposal(s, context, response)).ok).toBe(false);
});
