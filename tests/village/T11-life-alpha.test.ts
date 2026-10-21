import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadLifeAlpha } from '../../scripts/mlp_v4/load';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
it('loads genuine trained weights with provenance and selects all six alpha action families', () => {
  const data = JSON.parse(readFileSync('tests/fixtures/village/train-life-alpha.json', 'utf8'));
  const model = loadLifeAlpha('public/models/village-life-alpha-v1', data.ruleHash, V4_SPEC);
  const selected = new Set<string>();
  for (const row of data.rows.filter((r: { seed: number }) => data.heldoutSeeds.includes(r.seed))) {
    const result = rankCandidates(model, row.input); expect(result.source).toBe('mlp');
    selected.add(row.input.candidates.find((c: { id: string }) => c.id === result.selectedCandidateId).action);
  }
  expect([...selected]).toEqual(expect.arrayContaining(['GATHER_WOOD', 'GATHER_STONE', 'GATHER_ROPE', 'DEPOSIT', 'CRAFT', 'REST']));
});
