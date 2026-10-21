import { writeFileSync } from 'node:fs';
import { MiniMindAppraisal } from '../world/minimind-appraisal';
import { NativeAppraisal } from '../world/native-appraisal';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { ensureIssue } from '../../packages/social-core/src/issues';
import { buildSocialContext, requestSocialProposal, respondSocialProposal } from '../../src/games/camp/village/social/context';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { activateSocialPlan } from '../../src/games/camp/village/social/adapter';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
const root = process.cwd(), local = new MiniMindAppraisal(root), native = new NativeAppraisal(root), selected = process.argv[2] ?? 'minimind3';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
const state = createVillageState(rules, { id: 'real-social-p2', classification: 'experiment', worldId: 'real-social-p2', seed: 17, actors: [{ archetypeId: 'W001', instanceId: 'worker' }, { archetypeId: 'W001', instanceId: 'partner' }], inventory: {} });
state.actors.worker.body.energy = 20;
initializeEconomy(state, rules);
state.actors.worker.personal.knowledge.evidence.e1 = { eventId: 'e1', at: 0, kind: 'self.observed', source: 'observed', facts: { energy: 20, need: 'rest' } };
const issue = ensureIssue(state.social.issues, { actorId: 'worker', reason: 'low-energy', participants: ['worker', 'partner'], basisRefs: ['e1'] });
const context = buildSocialContext('worker', issue, state.actors.worker.personal.knowledge, state);
const calls: { prompt: string; raw: string; elapsedMs: number }[] = [];
try {
  const generate = async (prompt: string, schema: Record<string, unknown>, signal: AbortSignal) => {
    const start = Date.now(), raw = selected === 'minimind3' ? await local.generateJSON(prompt, schema, signal) : await native.generateJSON(selected, prompt, schema, signal); calls.push({ prompt, raw, elapsedMs: Date.now() - start }); return raw;
  };
  const result = await requestSocialProposal(state, context, generate, AbortSignal.timeout(180000));
  const responses = [];
  if (result.ok) {
    state.social.proposals[result.proposal.id] = result.proposal;
    for (const actorId of result.proposal.parties) responses.push(await respondSocialProposal(state, actorId, result.proposal, generate));
    if (responses.every(r => r.accepted && r.consent?.response === 'accept')) { activateSocialPlan(state, result.proposal.id); state.paused = false; for (let i = 0; i < 50; i++) advanceVillage(state); }
  }
  const evidence = { realProvider: selected, modelHash: selected === 'minimind3' ? 'c994601ed72cb24addd206ed28ee7e8cea0283081a0434947c4e1e7a6d2ce45e' : 'bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517', ruleHash: rules.ruleHash, calls, result, responses, agreements: state.social.agreements, resultingEnergy: state.actors.worker.body.energy, executionEvents: state.events.filter(e => e.kind === 'rest.completed' || e.kind === 'agreement.fulfilled') };
  writeFileSync(`native/Artifacts/village/P2/real-social-${selected}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ provider: evidence.realProvider, result, calls: calls.length }));
  if (!result.ok) process.exitCode = 1;
} finally { local.dispose(); native.dispose(); }
