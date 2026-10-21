import { mkdirSync, writeFileSync } from 'node:fs';
import { digest } from '../../packages/action-runtime/src/json';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy, addResourceNode } from '../../src/games/camp/village/systems/resources';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { buildObservation, V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { chooseLifeTeacher } from '../../src/games/camp/village/ai/life-teacher';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { lifeEngineHash } from '../mlp_v4/engine-hash';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1'), rows: unknown[] = [], coverage: Record<string, number> = {};
const seeds = Array.from({ length: 36 }, (_, i) => 101 + i);
const engineHash = lifeEngineHash();
for (const seed of seeds) {
  const lowYield = seed >= 119, ready = seed % 6 === 1;
  const state = createVillageState(rules, { id: `alpha-${seed}`, classification: 'experiment', worldId: `alpha-${seed}`, seed, actors: [{ archetypeId: 'H002', instanceId: 'worker' }], inventory: ready ? { wood:14,stone:4,rope:5,food:10 } : lowYield ? { wood: 13, stone: 3, rope: 4, food: 10 } : { wood: seed % 19, stone: seed % 7, rope: seed % 8, food: 10 } });
  initializeEconomy(state, rules); state.actors.worker.body.energy = ready ? 100 : seed % 3 === 0 ? 30 : seed % 2 === 0 ? 100 : 90; state.paused = false;
  for (const [index, resource] of (['wood', 'stone', 'rope'] as const).entries()) addResourceNode(state, rules, { id: `node-${resource}`, resource, level: lowYield ? 1 : 4, position: { x: lowYield ? index + 1 : 2 + index, y: 0 } });
  for (let decision = 0; decision < 18; decision++) {
    refreshKnowledge(state);
    const before = buildObservation(state, 'worker', state.actors.worker.personal.knowledge, 'life'), selected = chooseLifeTeacher(before), candidate = before.candidates.find(c => c.id === selected); if (!candidate) break;
    const command = { operationId: `decision-${decision}`, actorId: 'worker', action: candidate.action, ...(candidate.targetId ? { targetId: candidate.targetId } : {}), parameters: candidate.parameters, readSet: candidate.readSet, source: 'fallback' as const };
    const receipt = submitCommand(state, command); if (!receipt.accepted) throw new Error(`Teacher action rejected: ${receipt.reason}`);
    for (let step = 0; step < 3000 && ['accepted', 'running'].includes(state.executions[receipt.executionId!].status); step++) advanceVillage(state);
    const execution = state.executions[receipt.executionId!];
    if (execution.status !== 'completed') throw new Error(`Teacher task did not complete: ${execution.reason}`);
    coverage[candidate.action] = (coverage[candidate.action] ?? 0) + 1;
    rows.push({ seed, decision, actorId: 'worker', executionId: execution.id, source: 'fallback', teacherId: 'life-teacher-p2-v1', input: before, chosenIndex: before.candidates.indexOf(candidate), outcome: { status: execution.status, eventIds: execution.eventIds, inventory: { ...state.inventory }, carried: { ...state.actors.worker.carried }, body: { ...state.actors.worker.body }, stateHash: digest(state) } });
    if (Object.keys(state.economy!.items).length) break;
  }
}
for (const action of ['GATHER_WOOD', 'GATHER_STONE', 'GATHER_ROPE', 'DEPOSIT', 'CRAFT', 'REST']) if (!coverage[action]) throw new Error(`Missing actual teacher outcome for ${action}`);
const alphaOutput=process.env.CAMP_ALPHA_DATA_DIR??'data/village/life-alpha';
mkdirSync(alphaOutput, { recursive: true });
if (lifeEngineHash() !== engineHash) throw new Error('Executor source changed during collection');
const dataset = { format: 'village-life-alpha-dataset-v1', classification: 'experimental-imitation-of-life-teacher', engineHash, ruleHash: rules.ruleHash, spec: V4_SPEC, seeds, heldoutSeeds: seeds.filter(seed => seed % 5 === 0), coverage, rows };
writeFileSync(alphaOutput+'/dataset.json', JSON.stringify(dataset)); console.log(JSON.stringify({ rows: rows.length, coverage, ruleHash: rules.ruleHash }));
writeFileSync('tests/fixtures/village/train-life-alpha.json', JSON.stringify({ format: dataset.format, engineHash, ruleHash: rules.ruleHash, seeds, heldoutSeeds: dataset.heldoutSeeds, coverage, rows: (rows as { seed: number }[]).filter(row => dataset.heldoutSeeds.includes(row.seed)) }));
