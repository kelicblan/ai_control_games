import { describe, expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { buildObservation, V4_SPEC, stateFeatureNames } from '../../src/games/camp/village/ai/observation';
import { decodeCandidateModel, rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
import { sha256HexFallback } from '../../packages/action-runtime/src/sha256';
import type { CandidateManifest } from '../../packages/policy-runtime/src/types';
const rules = selectWorldRules('village-v1', 'draft-table-v1');
const world = () => createVillageState(rules, { id: 'policy-fixture', classification: 'fixture', worldId: 'w', seed: 17, inventory: { wood: 35 }, actors: [{ archetypeId: 'W001', instanceId: 'a' }] });
function fixture() {
  const weights = new Float32Array(33025);
  const inputIndex = 128 + 32 + 2; // work_eta_norm, same candidate schema for both heads
  weights[inputIndex * 128] = 1; weights[192 * 128 + 128] = 1; weights[192 * 128 + 128 + 128 * 64 + 64] = 1;
  const bytes = new Uint8Array(weights.buffer);
  const manifest: CandidateManifest = { format: 'village-candidate-mlp-v4', dtype: 'float32-le', modelId: 'explicit-parity-fixture', head: 'life', schemaId: V4_SPEC.schemaId,
    candidateSchemaId: V4_SPEC.candidateSchemaId, featureHash: V4_SPEC.featureHash, normalizerHash: V4_SPEC.normalizerHash, ruleHashes: [rules.ruleHash], layers: [192, 128, 64, 1], sha256: sha256HexFallback(bytes), kind: 'parity-fixture' };
  return { bytes, manifest };
}
describe('T06 frozen v4 observation and candidate model contract', () => {
  it('builds 192/160 input widths and uses own max HP and ten-recruit units', () => {
    const state = world(); state.actors.player.body.hp = 75;
    const life = buildObservation(state, 'player', state.actors.player.personal.knowledge, 'life');
    expect(life.stateFeatures).toHaveLength(128); expect(life.candidates[0].features).toHaveLength(64);
    expect(life.stateFeatures[0]).toBe(.5);
    expect(buildObservation(state, 'a', state.actors.a.personal.knowledge, 'tactical').stateFeatures).toHaveLength(96);
    expect(life.stateFeatures[stateFeatureNames('life').indexOf('known_free_wood_log')]).toBe(-1);
    const changed = structuredClone(state); changed.inventory.wood = 999; changed.actors.a.personal.goals.push({ id: 'secret', actorId: 'a', kind: 'status', priority: 1, progress: 0, basisRefs: [], revision: 1, reconsiderOn: [] });
    expect(buildObservation(changed, 'player', changed.actors.player.personal.knowledge, 'life')).toEqual(life);
  });
  it('rejects old models and corrupted bytes/schema/normalizers', () => {
    const f = fixture(); expect(() => decodeCandidateModel({ observationSchemaVersion: 3 }, f.bytes, V4_SPEC)).toThrow();
    const bad = f.bytes.slice(); bad[0] = 1; expect(() => decodeCandidateModel(f.manifest, bad, V4_SPEC)).toThrow(/hash|checksum/i);
    expect(() => decodeCandidateModel({ ...f.manifest, normalizerHash: '0'.repeat(64) }, f.bytes, V4_SPEC)).toThrow();
  });
  it('scores candidates, survives renaming and candidate permutation, and labels test weights honestly', () => {
    const state = world(), f = fixture(), model = decodeCandidateModel(f.manifest, f.bytes, V4_SPEC);
    const observation = buildObservation(state, 'a', state.actors.a.personal.knowledge, 'life');
    const result = rankCandidates(model, observation);
    expect(result.source).toBe('scripted_test'); expect(Object.values(result.rawScores)[0]).not.toBe(Object.values(result.rawScores)[1]);
    const shuffled = { ...observation, candidates: [...observation.candidates].reverse(), knownLegalMask: [...observation.knownLegalMask].reverse() };
    expect(rankCandidates(model, shuffled).selectedCandidateId).toBe(result.selectedCandidateId);
    state.actors.a.name = '另一名字'; expect(rankCandidates(model, buildObservation(state, 'a', state.actors.a.personal.knowledge, 'life')).rawScores).toEqual(result.rawScores);
    state.actors.a.body.downed = true;
    expect(rankCandidates(model, buildObservation(state, 'a', state.actors.a.personal.knowledge, 'life')).selectedCandidateId).toBeNull();
    expect(() => rankCandidates(model, { ...observation, ruleHash: '0'.repeat(64) })).toThrow();
  });
});
