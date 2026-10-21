import { readFileSync, writeFileSync } from 'node:fs';
import { loadLifeAlpha } from '../mlp_v4/load';
import { V4_SPEC, buildObservation } from '../../src/games/camp/village/ai/observation';
import { rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
import { chooseLifeTeacher } from '../../src/games/camp/village/ai/life-teacher';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy, addResourceNode } from '../../src/games/camp/village/systems/resources';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
const directory = process.argv[2] ?? 'public/models/village-life-alpha-v1';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1'), model = loadLifeAlpha(directory, rules.ruleHash, V4_SPEC), results = [];
for (const seed of [2001, 2002, 2003, 2004]) for (const mode of ['teacher', 'mlp']) {
  const state = createVillageState(rules, { id: `evaluation-${seed}`, classification: 'experiment', worldId: `evaluation-${seed}`, seed, inventory: { wood: 13, stone: 3, rope: 4, food: 8 }, actors: [{ archetypeId: 'H002', instanceId: 'worker' }] });
  initializeEconomy(state, rules); state.paused = false; state.actors.worker.body.energy = seed % 2 ? 35 : 90;
  for (const [i, resource] of (['wood', 'stone', 'rope'] as const).entries()) addResourceNode(state, rules, { id: resource, resource, level: 1, position: { x: i + 1, y: 0 } });
  const decisions = [];
  for (let index = 0; index < 20; index++) {
    refreshKnowledge(state); const input = buildObservation(state, 'worker', state.actors.worker.personal.knowledge, 'life');
    const decision = mode === 'mlp' ? rankCandidates(model, input) : null, selected = decision?.selectedCandidateId ?? chooseLifeTeacher(input), candidate = input.candidates.find(c => c.id === selected); if (!candidate) break;
    const receipt = submitCommand(state, { operationId: `eval-${index}`, actorId: 'worker', action: candidate.action, parameters: candidate.parameters, readSet: candidate.readSet, source: mode === 'mlp' ? 'mlp' : 'scripted_test', ...(candidate.targetId ? { targetId: candidate.targetId } : {}) });
    if (!receipt.accepted) { decisions.push({ action: candidate.action, status: 'rejected', reason: receipt.reason }); break; }
    for (let step = 0; step < 3000 && ['accepted', 'running'].includes(state.executions[receipt.executionId!].status); step++) advanceVillage(state);
    decisions.push({ action: candidate.action, status: state.executions[receipt.executionId!].status, executionId: receipt.executionId, modelHash: decision?.modelHash ?? null });
    if (Object.values(state.economy!.items).some(i => i.recipeId === 'WPN005')) break;
  }
  results.push({ seed, mode, elapsed: state.elapsed, inventory: state.inventory, itemCount: Object.keys(state.economy!.items).length, decisions });
}
const report = { ruleHash: rules.ruleHash, modelHash: model.manifest.sha256, trainingReport: JSON.parse(readFileSync(directory + '/training-report.json', 'utf8')).heldout, results };
writeFileSync(`native/Artifacts/village/P2/rollout-${model.manifest.modelId}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(results.map(r => ({ seed: r.seed, mode: r.mode, items: r.itemCount, actions: r.decisions.map(d => d.action), elapsed: r.elapsed }))));
