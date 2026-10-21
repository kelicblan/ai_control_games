import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensure } from '../../packages/action-runtime/src/json';
import { decodeCandidateModel } from '../../packages/policy-runtime/src/candidate-mlp';
import type { CandidateManifest, PolicySpec, PolicyHead } from '../../packages/policy-runtime/src/types';
import { lifeEngineHash } from './engine-hash';
import gates from '../../config/village/evaluation-gates.json';
export function loadPolicyBundle(directory: string, ruleHash: string, spec: PolicySpec, head: PolicyHead) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as CandidateManifest;
  const reportBytes = readFileSync(path.join(directory, 'training-report.json')), bytes = readFileSync(path.join(directory, 'weights.bin'));
  const report = JSON.parse(reportBytes.toString('utf8'));
  ensure(manifest.kind === 'trained' && manifest.head === head && manifest.ruleHashes.includes(ruleHash) && manifest.training?.reportHash === createHash('sha256').update(reportBytes).digest('hex') && manifest.training.dataHash === report.datasetHash && report.engineHash === lifeEngineHash() && report.steps > 0 && report.initialWeightHash !== report.weightHash && report.weightHash === manifest.sha256, 'Policy training provenance mismatch');
  ensure(report.validation?.top1 >= (head==='life'?gates.lifeValidationTop1Minimum:gates.tacticalValidationTop1Minimum)&&report.checkpoint?.testUsedForSelection===false,'Policy validation or split quality gate failed');
  return decodeCandidateModel(manifest, bytes, spec);
}
export function loadV4Bundle(directory:string,ruleHash:string,spec:PolicySpec){
  const release=JSON.parse(readFileSync(path.join(directory,'release.json'),'utf8'));
  ensure(release.format==='village-v4-release-v1'&&release.ruleHash===ruleHash&&release.featureHash===spec.featureHash&&release.normalizerHash===spec.normalizerHash,'Incompatible release contract');
  const life=loadPolicyBundle(path.join(directory,'life'),ruleHash,spec,'life'),tactical=loadPolicyBundle(path.join(directory,'tactical'),ruleHash,spec,'tactical');
  ensure(life.manifest.sha256===release.models.life&&tactical.manifest.sha256===release.models.tactical,'Release model hash mismatch');
  return{life,tactical,release};
}
