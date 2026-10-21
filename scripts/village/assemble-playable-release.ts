import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { loadPolicyBundle } from '../mlp_v4/load-bundle';
import { lifeEngineHash } from '../mlp_v4/engine-hash';
const root = process.argv[2] ?? 'native/Artifacts/playable-loop-final/models';
const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
const models = Object.fromEntries((['life', 'tactical'] as const).map(head => [head, loadPolicyBundle(`${root}/${head}`, rules.ruleHash, V4_SPEC, head).manifest.sha256]));
mkdirSync(root, { recursive: true });
writeFileSync(`${root}/release.json`, JSON.stringify({ format: 'village-v4-release-v1', classification: 'playable-loop-v1-real-current-executor-training', ruleVersion: rules.ruleVersion, ruleHash: rules.ruleHash, engineHash: lifeEngineHash(), featureHash: V4_SPEC.featureHash, normalizerHash: V4_SPEC.normalizerHash, models,
  training: Object.fromEntries(['life', 'tactical'].map(head => { const r = JSON.parse(readFileSync(`${root}/${head}/training-report.json`, 'utf8')); return [head, { epochs: r.epochs, steps: r.steps, validation: r.validation, checkpoint: r.checkpoint }]; })) }, null, 2));
console.log(JSON.stringify({ root, models }));
