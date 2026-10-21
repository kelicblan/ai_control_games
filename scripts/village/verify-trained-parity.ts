import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadLifeAlpha } from '../mlp_v4/load';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { ensure } from '../../packages/action-runtime/src/json';
const fixture = JSON.parse(readFileSync('tests/fixtures/village/train-life-alpha.json', 'utf8'));
const model = loadLifeAlpha('public/models/village-life-alpha-v1', fixture.ruleHash, V4_SPEC);
const bytes = readFileSync('public/models/village-life-alpha-v1/weights.bin'), weights = Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4));
const checks = [];
for (const row of fixture.rows.slice(0, 6)) {
  const input = [...row.input.stateFeatures, ...row.input.candidates[row.chosenIndex].features];
  const result = spawnSync('python', ['scripts/village/forward_reference.py'], { input: JSON.stringify({ input, weights, layers: model.manifest.layers }), encoding: 'utf8', windowsHide: true });
  ensure(result.status === 0, result.stderr); const reference = JSON.parse(result.stdout).score, actual = model.score(input), error = Math.abs(reference - actual);
  ensure(error < 1e-4, 'Trained JS/NumPy inference diverged'); checks.push({ executionId: row.executionId, actual, reference, absoluteError: error });
}
const report = { passed: true, modelHash: model.manifest.sha256, maxAbsoluteError: Math.max(...checks.map(c => c.absoluteError)), checks };
writeFileSync('native/Artifacts/village/P2/trained-parity.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
