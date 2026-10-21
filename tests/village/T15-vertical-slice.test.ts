import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { decodeCandidateModel, rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
it('loads real Tactical alpha and scores executor-derived heldout observations', () => {
  const root = 'public/models/village-tactical-alpha-v1/';
  const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
  const report = JSON.parse(readFileSync(root + 'training-report.json', 'utf8'));
  expect(report.initialWeightHash).not.toBe(report.weightHash); expect(report.steps).toBeGreaterThan(0);
  const model = decodeCandidateModel(manifest, readFileSync(root + 'weights.bin'), V4_SPEC);
  const fixture = JSON.parse(readFileSync('tests/fixtures/village/train-tactical-alpha.json', 'utf8'));
  expect(fixture.coverage).toEqual(expect.objectContaining({ ATTACK: expect.any(Number), RESCUE: expect.any(Number), REPOSITION: expect.any(Number) }));
  for (const row of fixture.rows.slice(0, 12)) expect(rankCandidates(model, row.input).source).toBe('mlp');
  expect(report.heldout.top1).toBeGreaterThanOrEqual(.7);
});
