import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensure } from '../../packages/action-runtime/src/json';
import { decodeCandidateModel } from '../../packages/policy-runtime/src/candidate-mlp';
import type { CandidateManifest, PolicySpec } from '../../packages/policy-runtime/src/types';
import { lifeEngineHash } from './engine-hash';
export function loadLifeAlpha(directory: string, ruleHash: string, spec: PolicySpec) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as CandidateManifest;
  ensure(manifest.kind === 'trained' && manifest.head === 'life' && manifest.ruleHashes.includes(ruleHash), 'A genuine compatible Life model is required');
  const bytes = readFileSync(path.join(directory, 'weights.bin')), reportBytes = readFileSync(path.join(directory, 'training-report.json'));
  ensure(createHash('sha256').update(reportBytes).digest('hex') === manifest.training?.reportHash, 'Training report hash mismatch');
  const report = JSON.parse(reportBytes.toString('utf8'));
  ensure(report.engineHash === lifeEngineHash() && report.kind === 'real-numpy-fp32-adam-imitation-training' && report.epochs > 0 && report.steps > 0 && report.datasetHash === manifest.training.dataHash && report.weightHash === manifest.sha256
    && report.initialWeightHash !== report.weightHash && report.heldout?.top1 >= .7 && ['GATHER_WOOD', 'GATHER_STONE', 'GATHER_ROPE', 'DEPOSIT', 'CRAFT', 'REST'].every(a => report.heldout.byAction[a]?.[1] > 0), 'Training provenance or alpha quality gate failed');
  return decodeCandidateModel(manifest, bytes, spec);
}
