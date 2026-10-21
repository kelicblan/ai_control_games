import { mkdirSync, writeFileSync } from 'node:fs';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { advanceWaveSchedule } from '../../src/games/camp/village/systems/waves';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { buildObservation, V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { chooseTacticalTeacher } from '../../src/games/camp/village/ai/tactical-teacher';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { lifeEngineHash } from '../mlp_v4/engine-hash';
import { digest } from '../../packages/action-runtime/src/json';
const rules = selectWorldRules('village-v1', 'p3-defense-alpha-v1');
const rows: unknown[] = [], failures: unknown[] = [], seeds = Array.from({ length: 60 }, (_, i) => 301 + i), coverage: Record<string, number> = {};
const engineHash = lifeEngineHash();
for (const seed of seeds) {
  const state = createVillageState(rules, { id: `tactical-${seed}`, worldId: `tactical-${seed}`, classification: 'experiment', seed, actors: [{ archetypeId: seed % 2 ? 'H002' : 'H004', instanceId: 'worker' }, { archetypeId: 'W001', instanceId: 'partner' }], inventory: { food: 100, wood: 100, stone: 100 } });
  initializeEconomy(state, rules); initializeCombat(state, { center: { x: 0, y: 0 }, radius: 10 });
  state.elapsed = (rules.tables.waves[0].day - 1) * 720 + 480; state.tick = Math.round(state.elapsed * 10);
  advanceWaveSchedule(state); state.economy!.fence.hp = 0; state.paused = false;
  state.actors.worker.position = { x: 15 + seed % 5, y: seed % 3 };
  state.actors.partner.position = { ...state.actors.worker.position };
  if (seed % 4 === 0) state.actors.worker.body.hp = Math.floor(state.actors.worker.body.maxHp * .2);
  if (seed % 4 === 1) { state.actors.partner.body.hp = 0; state.actors.partner.body.downed = true; state.combat!.downedAt.partner = state.elapsed; }
  if (seed % 4 === 2) state.actors.partner.body.hp = 20;
  for (let decision = 0; decision < 12; decision++) {
    refreshKnowledge(state); const input = buildObservation(state, 'worker', state.actors.worker.personal.knowledge, 'tactical');
    const id = chooseTacticalTeacher(input), chosenIndex = input.candidates.findIndex(c => c.id === id); if (chosenIndex < 0) break;
    const c = input.candidates[chosenIndex], receipt = submitCommand(state, { operationId: `decision-${decision}`, actorId: 'worker', action: c.action, ...(c.targetId ? { targetId: c.targetId } : {}), parameters: c.parameters, readSet: c.readSet, source: 'fallback' });
    if (!receipt.accepted) { failures.push({ seed, decision, action: c.action, reason: receipt.reason }); break; }
    for (let step = 0; step < 1000 && ['accepted', 'running'].includes(state.executions[receipt.executionId!].status); step++) advanceVillage(state);
    const execution = state.executions[receipt.executionId!];
    if (execution.status !== 'completed') { failures.push({ seed, decision, action: c.action, reason: execution.reason, status: execution.status }); break; }
    coverage[c.action] = (coverage[c.action] ?? 0) + 1;
    rows.push({ seed, decision, executionId: execution.id, input, chosenIndex, outcome: { status: execution.status, eventIds: execution.eventIds, stateHash: digest(state) } });
  }
}
if (lifeEngineHash() !== engineHash) throw new Error('Executor changed during collection');
const dataset = { format: 'village-tactical-alpha-dataset-v1', head: 'tactical', engineHash, ruleHash: rules.ruleHash, spec: V4_SPEC, seeds, heldoutSeeds: seeds.filter(s => s % 5 === 0), coverage, failures, rows };
const output=process.env.CAMP_TACTICAL_ALPHA_DATA_DIR??'data/village/tactical-alpha';mkdirSync(output,{recursive:true});writeFileSync(output+'/dataset.json',JSON.stringify(dataset));
writeFileSync('tests/fixtures/village/train-tactical-alpha.json', JSON.stringify({ ...dataset, rows: (rows as { seed: number }[]).filter(r => dataset.heldoutSeeds.includes(r.seed)) }));
console.log(JSON.stringify({ rows: rows.length, coverage, failures: failures.length, ruleHash: rules.ruleHash }));
