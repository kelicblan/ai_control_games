import { expect, it } from 'vitest';
import { runScenario, replayVillage } from '../../src/games/camp/village/simulation';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { decodeCandidateModel, rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
import { sha256HexFallback } from '../../packages/action-runtime/src/sha256';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
it('records candidate inference evidence and replays decisions without rerunning the model', () => {
  const rules = selectWorldRules('village-v1', 'draft-table-v1'), weights = new Float32Array(33025);
  weights[(128 + 34) * 128] = 1; weights[192 * 128 + 128] = 1; weights[192 * 128 + 128 + 128 * 64 + 64] = 1;
  const bytes = new Uint8Array(weights.buffer);
  const model = decodeCandidateModel({ format: 'village-candidate-mlp-v4', dtype: 'float32-le', modelId: 'scripted-parity', kind: 'parity-fixture', head: 'life',
    schemaId: V4_SPEC.schemaId, candidateSchemaId: V4_SPEC.candidateSchemaId, featureHash: V4_SPEC.featureHash, normalizerHash: V4_SPEC.normalizerHash,
    ruleHashes: [rules.ruleHash], layers: [192, 128, 64, 1], sha256: sha256HexFallback(bytes) }, bytes, V4_SPEC);
  const run = runScenario({ scenario: { id: 'policy-run', classification: 'fixture', worldId: 'policy-run', seed: 17, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: {} }, ticks: 12, commands: [] },
    { actorIds: ['a'], decide: input => rankCandidates(model, input) });
  expect(run.groups[0].rawScores['wait-1']).toBeGreaterThan(run.groups[0].rawScores['wait-0.5']);
  expect(run.groups[0]).toMatchObject({ source: 'scripted_test', modelId: 'scripted-parity', status: 'completed' });
  expect(run.groups[1].truncated).toBe(true);
  expect(replayVillage(rules, run).finalHash).toBe(run.finalHash);
});
