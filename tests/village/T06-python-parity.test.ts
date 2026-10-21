import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { decodeCandidateModel } from '../../packages/policy-runtime/src/candidate-mlp';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { sha256HexFallback } from '../../packages/action-runtime/src/sha256';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
it('matches independent NumPy FP32 forward scores for both v4 heads', () => {
  for (const head of ['life', 'tactical'] as const) {
    const layers = V4_SPEC.heads[head].layers;
    const count = layers.slice(1).reduce((n, width, i) => n + layers[i] * width + width, 0);
    const weights = Float32Array.from({ length: count }, (_, i) => Math.sin(i * 1.73) * .02);
    const bytes = new Uint8Array(weights.buffer);
    const model = decodeCandidateModel({ format: 'village-candidate-mlp-v4', dtype: 'float32-le', modelId: 'parity-only', head, schemaId: V4_SPEC.schemaId,
      candidateSchemaId: V4_SPEC.candidateSchemaId, featureHash: V4_SPEC.featureHash, normalizerHash: V4_SPEC.normalizerHash, ruleHashes: [selectWorldRules('village-v1', 'draft-table-v1').ruleHash], layers, sha256: sha256HexFallback(bytes), kind: 'parity-fixture' }, bytes, V4_SPEC);
    const input = Array.from({ length: layers[0] }, (_, i) => Math.fround(Math.cos(i * .23)));
    const reference = spawnSync('python', ['scripts/village/forward_reference.py'], { input: JSON.stringify({ layers, weights: Array.from(weights), input }), encoding: 'utf8', windowsHide: true });
    expect(reference.status, reference.stderr).toBe(0);
    expect(Math.abs(model.score(input) - JSON.parse(reference.stdout).score)).toBeLessThan(1e-5);
  }
}, 20000);
