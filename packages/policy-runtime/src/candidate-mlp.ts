import { ensure, digest } from '../../action-runtime/src/json';
import { sha256HexFallback } from '../../action-runtime/src/sha256';
import type { CandidateManifest, LoadedCandidateModel, PolicyInput, PolicySpec, PolicyDecision } from './types';
export function decodeCandidateModel(value: unknown, bytes: Uint8Array, spec: PolicySpec): LoadedCandidateModel {
  const m = value as CandidateManifest;
  ensure(!!m && m.format === 'village-candidate-mlp-v4' && m.dtype === 'float32-le', 'Unsupported model format');
  const head = spec.heads[m.head];
  ensure(!!head && m.schemaId === spec.schemaId && m.candidateSchemaId === spec.candidateSchemaId && m.featureHash === spec.featureHash && m.normalizerHash === spec.normalizerHash, 'Model contract mismatch');
  ensure(digest(m.layers) === digest(head.layers) && Array.isArray(m.ruleHashes) && m.ruleHashes.length > 0 && m.ruleHashes.every(h => /^[a-f0-9]{64}$/.test(h)), 'Invalid model architecture or rules');
  ensure(m.kind === 'parity-fixture' || (m.kind === 'trained' && !!m.training && /^[a-f0-9]{64}$/.test(m.training.dataHash) && /^[a-f0-9]{64}$/.test(m.training.reportHash)), 'Missing training provenance');
  ensure(sha256HexFallback(bytes) === m.sha256, 'Model checksum mismatch');
  const count = head.layers.slice(1).reduce((n, width, i) => n + head.layers[i] * width + width, 0);
  ensure(bytes.byteLength === count * 4, 'Invalid weight count');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const weights = Array.from({ length: count }, (_, i) => view.getFloat32(i * 4, true));
  ensure(weights.every(Number.isFinite), 'Nonfinite model weight');
  const manifest = structuredClone(m), contract = structuredClone(spec);
  return { manifest, spec: contract, score(input) {
    ensure(input.length === head.inputDim && input.every(Number.isFinite), 'Invalid policy input');
    let x = input.slice(), offset = 0;
    for (let layer = 1; layer < head.layers.length; layer++) {
      const width = head.layers[layer], previous = head.layers[layer - 1];
      const y = Array.from({ length: width }, (_, j) => {
        let sum = weights[offset + previous * width + j];
        for (let i = 0; i < previous; i++) sum = Math.fround(sum + Math.fround(x[i] * weights[offset + i * width + j]));
        return layer < head.layers.length - 1 ? Math.max(0, sum) : sum;
      });
      offset += previous * width + width; x = y;
    }
    ensure(Number.isFinite(x[0]), 'Nonfinite policy score'); return x[0];
  } };
}
export function rankCandidates(model: LoadedCandidateModel, input: PolicyInput): PolicyDecision {
  const m = model.manifest, head = model.spec.heads[input.head];
  ensure(input.head === m.head && input.schemaId === m.schemaId && input.featureHash === m.featureHash && input.normalizerHash === m.normalizerHash && m.ruleHashes.includes(input.ruleHash), 'Policy contract or rule mismatch');
  ensure(input.stateFeatures.length === head.stateDim && input.candidates.length <= head.candidateLimit && input.knownLegalMask.length === input.candidates.length, 'Invalid candidate shape');
  const scores: Record<string, number> = Object.create(null);
  for (const [i, c] of input.candidates.entries()) {
    ensure(c.actorId === input.actorId && c.features.length === 64 && !(c.id in scores), 'Invalid candidate');
    if (input.knownLegalMask[i]) scores[c.id] = model.score([...input.stateFeatures, ...c.features]);
  }
  const selected = Object.keys(scores).sort((a, b) => scores[b] - scores[a] || a.localeCompare(b))[0] ?? null;
  return { selectedCandidateId: selected, rawScores: scores, head: input.head, source: m.kind === 'trained' ? 'mlp' : 'scripted_test', modelId: m.modelId, modelHash: m.sha256, latencyMs: 0, truncatedCandidates: input.truncatedCandidates };
}
