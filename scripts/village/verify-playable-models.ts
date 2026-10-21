import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ensure, digest } from '../../packages/action-runtime/src/json';
import { loadV4Bundle } from '../mlp_v4/load-bundle';
import { lifeEngineHash } from '../mlp_v4/engine-hash';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { initializeWorkshop } from '../../src/games/camp/village/systems/workshop';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { buildObservation, V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
import { chooseReleaseLifeTeacher } from '../../src/games/camp/village/ai/release-life-teacher';
import { newWorld } from '../../src/games/camp/world/newWorldProfile';
const root = process.argv[2] ?? 'native/Artifacts/playable-loop-final', modelsRoot = `${root}/models`;
const rules = selectWorldRules('village-v1', 'p4-social-content-v1'), bundle = loadV4Bundle(modelsRoot, rules.ruleHash, V4_SPEC), engineHash = lifeEngineHash();
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const scoresDigest = (scores: Record<string, number>) => digest(Object.fromEntries(Object.entries(scores)));
const reports: unknown[] = [], metamorphic: unknown[] = [];
for (const head of ['life', 'tactical'] as const) {
  const dataFile = `${root}/release/${head}/dataset.json`, bytes = readFileSync(dataFile), data = JSON.parse(bytes.toString('utf8')), model = bundle[head];
  ensure(data.engineHash === engineHash && createHash('sha256').update(bytes).digest('hex') === model.manifest.training!.dataHash, 'Dataset and optimized model must match current source');
  ensure(!data.trainSeeds.some((s: number) => [...data.validationSeeds, ...data.testSeeds].includes(s)) && !data.validationSeeds.some((s: number) => data.testSeeds.includes(s)), 'Seed split overlap');
  ensure(data.rows.every((r: any) => r.outcome.status === 'completed'), 'Negative outcomes must not be positive training rows');
  const weights = readFileSync(`${modelsRoot}/${head}/weights.bin`), floats = Array.from({ length: weights.length / 4 }, (_, i) => weights.readFloatLE(i * 4)), checks: unknown[] = [];
  for (const row of data.rows.filter((r: any) => data.testSeeds.includes(r.seed)).filter((_: unknown, i: number) => i % 17 === 0).slice(0, 12)) {
    const input = [...row.input.stateFeatures, ...row.input.candidates[row.chosenIndex].features];
    const python = spawnSync('python', ['scripts/village/forward_reference.py'], { input: JSON.stringify({ input, weights: floats, layers: model.manifest.layers }), encoding: 'utf8', windowsHide: true });
    ensure(python.status === 0, python.stderr); const error = Math.abs(JSON.parse(python.stdout).score - model.score(input)); ensure(error < 1e-4, 'Independent Python / TS parity failed');
    checks.push({ executionId: row.executionId, error });
    const before = rankCandidates(model, row.input), reversed = structuredClone(row.input); reversed.candidates.reverse(); reversed.knownLegalMask.reverse();
    const after = rankCandidates(model, reversed); ensure(before.selectedCandidateId === after.selectedCandidateId && scoresDigest(before.rawScores) === scoresDigest(after.rawScores), 'Candidate order changes decisions');
    const renamed = structuredClone(row.input); renamed.actorId = 'renamed'; renamed.candidates.forEach((c: any) => { c.actorId = 'renamed'; if (c.targetId) c.targetId = 'renamed-' + c.targetId; });
    ensure(scoresDigest(rankCandidates(model, renamed).rawScores) === scoresDigest(before.rawScores), 'Identity leaked into scores'); metamorphic.push({ head, executionId: row.executionId, reorder: true, rename: true });
  }
  ensure(checks.length > 0, 'Missing independent parity samples');
  reports.push({ head, modelHash: model.manifest.sha256, rows: data.rows.length, negativeTrajectories: data.failures.length, training: json(`${modelsRoot}/${head}/training-report.json`).validation, checks });
}
const splits = json('config/village/dataset-splits.json'), physical: unknown[] = [];
for (const seed of splits.testSeeds as number[]) for (const mode of ['teacher', 'mlp']) {
  const center = newWorld?.spawn ?? { x: 0, y: 0 };
  const archetypeId = ['W001', 'W002', 'W003'][seed % 3];
  const s = createVillageState(rules, { id: 'workshop-physical', classification: 'experiment', worldId: `physical-${mode}-${seed}`, seed, inventory: { wood: 80, stone: 40, rope: 30, food: 100 }, actors: [{ archetypeId, instanceId: 'worker', initial: { position: { x: center.x, y: center.y + 1 }, personality: { bravery: (seed % 10) / 10, diligence: (seed % 7) / 7, empathy: (seed % 5) / 5 } } }] });
  initializeEconomy(s, rules); s.economy!.storePosition = { ...center }; s.actors.player.position = { ...center };
  if (newWorld) s.navigation = { mode: 'shared-world', routes: {} };
  initializeCombat(s, { center, radius: 10, ...(newWorld ? { kind: 'shared-world' as const, gatePosition: newWorld.gate } : {}) }); s.combat!.gateOpen = true;
  initializeWorkshop(s); s.paused = false;
  const build = submitCommand(s, { operationId: 'build', actorId: 'player', action: 'BUILD_WORKSHOP', parameters: {}, readSet: {}, source: 'scripted_test' }); ensure(build.accepted, build.reason ?? 'Build failed');
  for (let i = 0; i < 1000 && ['accepted', 'running'].includes(s.executions[build.executionId!].status); i++) advanceVillage(s);
  ensure(s.economy!.workshop!.completedEventId, 'Physical workshop must be completed');
  const decisions: unknown[] = [];
  for (let index = 0; index < 12 && !s.actors.worker.equipment; index++) {
    refreshKnowledge(s); const input = buildObservation(s, 'worker', s.actors.worker.personal.knowledge, 'life');
    const selected = mode === 'mlp' ? rankCandidates(bundle.life, input).selectedCandidateId : chooseReleaseLifeTeacher(input), c = input.candidates.find(c => c.id === selected); if (!c) break;
    const r = submitCommand(s, { operationId: `step-${index}`, actorId: 'worker', issuedAtTick: s.tick, action: c.action, parameters: c.parameters, readSet: c.readSet, source: mode === 'mlp' ? 'mlp' : 'fallback', ...(c.targetId ? { targetId: c.targetId } : {}) });
    if (!r.accepted) { decisions.push({ action: c.action, status: 'rejected', reason: r.reason }); break; }
    for (let i = 0; i < 1500 && ['accepted', 'running'].includes(s.executions[r.executionId!].status); i++) advanceVillage(s);
    const e = s.executions[r.executionId!]; decisions.push({ action: c.action, status: e.status, reason: e.reason ?? null }); if (e.status !== 'completed') break;
  }
  physical.push({ seed, mode, archetypeId, personality: s.actors.worker.personality, equipment: s.actors.worker.equipment, production: Object.keys(s.economy!.items).length > 0, success: !!s.actors.worker.equipment, decisions });
}
const counts = (mode: string) => { const rows = (physical as any[]).filter(r => r.mode === mode); return { total: rows.length, successes: rows.filter(r => r.success).length, rate: rows.filter(r => r.success).length / rows.length }; };
const teacher = counts('teacher'), mlp = counts('mlp');
const passed = mlp.rate >= .75 && teacher.rate - mlp.rate <= .2;
const result = { passed, engineHash, models: bundle.release.models, classification: 'real-optimizer-current-source-with-frozen-heldout-physical-executor-tests', map: newWorld?.id ?? 'isolated-fixture', reports, metamorphic, physical, summary: { teacher, mlp }, limitations: ['Synthetic declared inventory fixtures, not a claim about human enjoyment or every survival scenario.', 'Tactical validation is teacher agreement; no new optimal-combat or survival claim.'] };
mkdirSync(root, { recursive: true }); writeFileSync(`${root}/verification.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed, models: result.models, summary: result.summary })); ensure(passed, 'Heldout physical workshop production / autonomous equipment gate failed');
