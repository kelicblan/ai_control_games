import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeWorkshop } from '../../src/games/camp/village/systems/workshop';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { buildObservation } from '../../src/games/camp/village/ai/observation';
import { chooseReleaseLifeTeacher } from '../../src/games/camp/village/ai/release-life-teacher';
import { lifeEngineHash } from '../mlp_v4/engine-hash';
import { digest, ensure } from '../../packages/action-runtime/src/json';

const file = process.argv[2], dataset = JSON.parse(readFileSync(file, 'utf8'));
ensure(dataset.head === 'life' && dataset.engineHash === lifeEngineHash(), 'Fresh current-engine Life dataset required');
ensure(!dataset.playableLoop, 'Workshop trajectories already appended');
const rules = selectWorldRules('village-v1', 'p4-social-content-v1'); let added = 0;
for (const seed of dataset.seeds as number[]) {
  const s = createVillageState(rules, { id: 'workshop-training', classification: 'experiment', worldId: `workshop-${seed}`, seed,
    inventory: { wood: 80, stone: 40, rope: 30, food: 100 }, actors: [{ archetypeId: 'W001', instanceId: 'worker', initial: { position: { x: 0, y: 1 } } }] });
  initializeEconomy(s, rules); initializeWorkshop(s); s.paused = false;
  const built = submitCommand(s, { operationId: 'build', actorId: 'player', action: 'BUILD_WORKSHOP', parameters: {}, readSet: {}, source: 'scripted_test' });
  ensure(built.accepted, 'Declared workshop fixture must be constructible');
  for (let i = 0; i < 1000 && ['accepted', 'running'].includes(s.executions[built.executionId!].status); i++) advanceVillage(s);
  ensure(s.economy!.workshop!.completedEventId, 'Construction must complete before training starts');
  for (let decision = 0; decision < 6; decision++) {
    refreshKnowledge(s); const input = buildObservation(s, 'worker', s.actors.worker.personal.knowledge, 'life');
    const selected = chooseReleaseLifeTeacher(input), chosenIndex = input.candidates.findIndex(c => c.id === selected); if (chosenIndex < 0) break;
    const c = input.candidates[chosenIndex];
    const receipt = submitCommand(s, { operationId: `work-${decision}`, actorId: 'worker', issuedAtTick: s.tick, action: c.action, parameters: c.parameters, readSet: c.readSet, source: 'fallback', ...(c.targetId ? { targetId: c.targetId } : {}) });
    if (!receipt.accepted) { dataset.failures.push({ seed, family: 'workshop-production', decision, reason: receipt.reason, status: 'rejected' }); break; }
    for (let i = 0; i < 1500 && ['accepted', 'running'].includes(s.executions[receipt.executionId!].status); i++) advanceVillage(s);
    const task = s.executions[receipt.executionId!];
    if (task.status !== 'completed') { dataset.failures.push({ seed, family: 'workshop-production', decision, status: task.status, reason: task.reason ?? null }); break; }
    dataset.rows.push({ seed, family: 'workshop-production', episodeId: s.worldId, decision, executionId: task.id, source: 'fallback', teacherId: 'life-release-teacher-v1', initialization: 'declared-inventory-and-executed-workshop-construction', input, chosenIndex, outcome: { status: task.status, eventIds: task.eventIds, stateHash: digest(s) } });
    dataset.coverage[c.action] = (dataset.coverage[c.action] ?? 0) + 1; added++;
    if (s.actors.worker.equipment) break;
  }
}
ensure(dataset.engineHash === lifeEngineHash(), 'Source changed during workshop collection');
dataset.playableLoop = { version: 1, added, collectorHash: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex') };
writeFileSync(file, JSON.stringify(dataset)); console.log(JSON.stringify({ added, rows: dataset.rows.length, failures: dataset.failures.length, coverage: dataset.coverage }));
