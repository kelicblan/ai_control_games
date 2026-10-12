import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { baselinePolicy, decodePolicy, inferPolicy, type LoadedPolicy } from '../src/ai/policy';
import { isAtCamp } from '../src/game/constants';
import { advanceGame, createGame, issueCommand } from '../src/game/engine';
import type { Difficulty, GameCommand, GameState, PolicyFunction, PolicyMode, ScenarioId } from '../src/game/types';

const FIXED_STEP_SECONDS = 0.1;
const SCENARIOS: ScenarioId[] = ['standard', 'storm', 'conflict'];
const DIFFICULTIES: Difficulty[] = ['normal', 'hard'];
const MODES: PolicyMode[] = ['model', 'rules'];
const RESCUE = {
  seed: 7, checkEveryTicks: 100, woodBelow: 9, woodBeforeSeconds: 205,
  fireBelow: 43, feedHungerAbove: 82, recallTick: 2100,
} as const;

type Controller = 'none' | 'rescue';
type FailureCause = 'npc_death' | 'fire_extinguished' | 'outside_safe_camp' | 'unknown' | null;

interface Options { seeds: number[]; output?: string; help: boolean }
interface CommandRecord {
  tick: number;
  timeSeconds: number;
  command: GameCommand;
  applied: boolean;
  feedback: string[];
}

function parseOptions(args: string[]): Options {
  const options: Options = { seeds: [7], help: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    if (flag !== '--seeds' && flag !== '--output') throw new Error(`Unknown argument: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    if (flag === '--output') options.output = value;
    else {
      const seeds = value.split(',');
      if (seeds.some(seed => !/^\d+$/.test(seed) || !Number.isSafeInteger(Number(seed)) || Number(seed) > 0xffffffff)) {
        throw new Error('--seeds must contain comma-separated unsigned 32-bit integers.');
      }
      options.seeds = [...new Set(seeds.map(Number))];
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`CampMind reproducible local evaluation (Node.js)

Usage: npm run evaluate -- [--seeds 7,64138] [--output ./evaluation.json]

Default: 12 unattended games (seed 7 × 3 scenarios × 2 difficulties × 2 policies)
and 2 rescue games, reusing the matching hard/storm/7 unattended controls.
--seeds changes the unattended matrix. Hard/storm/7 controls are added if absent.
--output writes the complete JSON report to an existing directory; by default no file is written.
All runs advance the real engine at a fixed 0.1 simulated seconds per tick.
Reported timing is measured in this Node.js process, without browser rendering or pacing.`);
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function readModel(): Promise<{ model: LoadedPolicy; manifestSha256: string }> {
  const manifestBytes = await readFile(new URL('../public/models/manifest.json', import.meta.url));
  const manifest: unknown = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest || typeof manifest !== 'object' || !('weightsFile' in manifest)
    || typeof manifest.weightsFile !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.f32$/.test(manifest.weightsFile)) {
    throw new Error('Invalid local model manifest weightsFile.');
  }
  const bytes = await readFile(new URL(`../public/models/${manifest.weightsFile}`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const model = decodePolicy(manifest, buffer);
  if (sha256(bytes) !== model.manifest.sha256) throw new Error('Local model SHA-256 checksum mismatch.');
  return { model, manifestSha256: sha256(manifestBytes) };
}

async function sourceHashes(): Promise<Record<string, string>> {
  const paths = [
    'src/game/engine.ts', 'src/game/constants.ts', 'src/game/types.ts', 'src/game/observation.ts',
    'src/game/physics.ts', 'src/game/terrain.ts', 'src/game/weather.ts',
    'src/ai/policy.ts', 'src/ai/teacher.ts', 'scripts/evaluate.ts',
  ];
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha256(await readFile(new URL(`../${path}`, import.meta.url)))])));
}

/** Records calls to the real command API, including calls the game declines or delays. */
function rescueStep(initial: GameState, tick: number, commands: CommandRecord[]): GameState {
  if (tick % RESCUE.checkEveryTicks !== 0) return initial;
  let state = initial;
  const send = (command: GameCommand): void => {
    const before = state;
    state = issueCommand(before, command);
    const events = state.events.filter(event => event.id >= before.nextEventId);
    const target = state.npcs.find(npc => npc.id === command.npcId);
    const applied = command.type === 'feed'
      ? state.stats.meals > before.stats.meals
      : state.nextEventId > before.nextEventId;
    commands.push({
      tick, timeSeconds: before.elapsed, command: { ...command }, applied,
      feedback: events.length ? events.map(event => event.text) : target?.speech ? [target.speech] : [],
    });
  };
  if (state.wood < RESCUE.woodBelow && state.elapsed < RESCUE.woodBeforeSeconds
    && state.npcs.find(npc => npc.id === 'azhuang')!.action !== 'wood') {
    send({ type: 'assign', npcId: 'azhuang', action: 'wood' });
  }
  if (state.fire < RESCUE.fireBelow && state.wood > 0
    && state.npcs.find(npc => npc.id === 'laozhou')!.action !== 'fire') {
    send({ type: 'assign', npcId: 'laozhou', action: 'fire' });
  }
  for (const id of state.npcs.map(npc => npc.id)) {
    const npc = state.npcs.find(member => member.id === id)!;
    if (npc.hunger > RESCUE.feedHungerAbove && state.food > 0) send({ type: 'feed', npcId: id });
  }
  if (tick === RESCUE.recallTick) send({ type: 'recall' });
  return state;
}

function failureCause(state: GameState): FailureCause {
  if (state.status === 'won') return null;
  if (state.npcs.some(npc => !npc.alive || npc.health <= 0)) return 'npc_death';
  if (state.fire <= 0) return 'fire_extinguished';
  if (state.elapsed >= state.duration && state.npcs.some(npc => !isAtCamp(npc))) return 'outside_safe_camp';
  return 'unknown';
}

function runGame(seed: number, scenario: ScenarioId, difficulty: Difficulty, mode: PolicyMode, controller: Controller, model: LoadedPolicy) {
  let state: GameState = { ...createGame({ seed, scenario, difficulty, mode }), status: 'playing' };
  const initialNpcCommands = state.npcs.map(npc => ({ npcId: npc.id, command: npc.command }));
  const commands: CommandRecord[] = [];
  const policy: PolicyFunction = mode === 'model' ? observation => inferPolicy(model, observation) : baselinePolicy;
  const started = performance.now();
  const maxTicks = Math.ceil(state.duration / FIXED_STEP_SECONDS) + 1;
  let ticks = 0;
  while (state.status === 'playing' && ticks < maxTicks) {
    if (controller === 'rescue') state = rescueStep(state, ticks, commands);
    state = advanceGame(state, FIXED_STEP_SECONDS, policy);
    ticks += 1;
  }
  const wallClockMs = performance.now() - started;
  if (state.status !== 'won' && state.status !== 'lost') throw new Error('Game did not reach a terminal state within its duration.');
  const decisionCount = state.stats.modelDecisions + state.stats.ruleDecisions + state.stats.fallbackDecisions;
  const survivors = state.npcs.filter(npc => npc.alive).length;
  return {
    id: `${seed}:${scenario}:${difficulty}:${mode}:${controller}`,
    seed, scenario, difficulty, policy: mode, controller,
    outcome: state.status, failureCause: failureCause(state), resultReason: state.resultReason,
    elapsedSeconds: state.elapsed, durationSeconds: state.duration, ticks, wallClockMs,
    score: state.score, survivors, npcCount: state.npcs.length, survivalRate: survivors / state.npcs.length,
    fire: state.fire, wood: state.wood, food: state.food,
    npcHealth: state.npcs.map(npc => ({
      npcId: npc.id, alive: npc.alive, health: npc.health, hunger: npc.hunger,
      energy: npc.energy, morale: npc.morale, injured: npc.injured,
      atCamp: isAtCamp(npc), position: { ...npc.position },
    })),
    decisionCount, modelDecisions: state.stats.modelDecisions, ruleDecisions: state.stats.ruleDecisions,
    fallbackDecisions: state.stats.fallbackDecisions,
    totalInferenceMs: state.stats.totalLatency,
    avgInferenceMs: decisionCount ? state.stats.totalLatency / decisionCount : 0,
    gatheredWood: state.stats.gatheredWood, gatheredFood: state.stats.gatheredFood,
    meals: state.stats.meals, helps: state.stats.helps, taskSwitches: state.stats.taskSwitches,
    initialNpcCommands, commandCount: commands.length,
    appliedCommandCount: commands.filter(command => command.applied).length, commands,
  };
}

type Run = ReturnType<typeof runGame>;

function summarize(runs: Run[]) {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const key = `${run.difficulty}:${run.policy}:${run.controller}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()].map(rows => ({
    difficulty: rows[0].difficulty, policy: rows[0].policy, controller: rows[0].controller,
    samples: rows.length, wins: rows.filter(row => row.outcome === 'won').length,
    fireFailures: rows.filter(row => row.failureCause === 'fire_extinguished').length,
    meanScore: rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
    meanSurvivalRate: rows.reduce((sum, row) => sum + row.survivalRate, 0) / rows.length,
    decisionCount: rows.reduce((sum, row) => sum + row.decisionCount, 0),
    fallbackDecisions: rows.reduce((sum, row) => sum + row.fallbackDecisions, 0),
  }));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const startedAt = new Date().toISOString();
  const { model, manifestSha256 } = await readModel();
  const sources = await sourceHashes();
  const started = performance.now();
  const runs: Run[] = [];
  for (const seed of options.seeds) for (const scenario of SCENARIOS) for (const difficulty of DIFFICULTIES) for (const mode of MODES) {
    runs.push(runGame(seed, scenario, difficulty, mode, 'none', model));
  }
  const rescueComparisons = MODES.map(mode => {
    let control = runs.find(run => run.seed === RESCUE.seed && run.scenario === 'storm' && run.difficulty === 'hard' && run.policy === mode && run.controller === 'none');
    if (!control) { control = runGame(RESCUE.seed, 'storm', 'hard', mode, 'none', model); runs.push(control); }
    const rescue = runGame(RESCUE.seed, 'storm', 'hard', mode, 'rescue', model);
    runs.push(rescue);
    return {
      policy: mode, seed: RESCUE.seed, scenario: 'storm', difficulty: 'hard',
      controlRunId: control.id, rescueRunId: rescue.id,
      controlOutcome: control.outcome, rescueOutcome: rescue.outcome,
      controlElapsedSeconds: control.elapsedSeconds, rescueElapsedSeconds: rescue.elapsedSeconds,
      scoreDifference: rescue.score - control.score,
      survivorDifference: rescue.survivors - control.survivors,
      commandCount: rescue.commandCount, appliedCommandCount: rescue.appliedCommandCount,
    };
  });
  const evaluationWallClockMs = performance.now() - started;
  const currentSources = await sourceHashes();
  if (JSON.stringify(sources) !== JSON.stringify(currentSources)) throw new Error('Evaluated source files changed during the run; rerun against a stable checkout.');
  const report = {
    schemaVersion: 1, generatedAt: startedAt,
    environment: {
      runtime: 'Node.js', version: process.version, platform: process.platform, arch: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown', evaluationWallClockMs,
      timingScope: 'Unpaced Node.js simulation. Per-decision inference time excludes rendering, observation construction and engine updates; no dedicated warm-up.',
    },
    protocol: {
      fixedStepSeconds: FIXED_STEP_SECONDS, matrixSeeds: options.seeds,
      scenarios: SCENARIOS, difficulties: DIFFICULTIES, policies: MODES,
      rescueController: {
        seed: RESCUE.seed, scenario: 'storm', difficulty: 'hard',
        checkEverySeconds: RESCUE.checkEveryTicks * FIXED_STEP_SECONDS, firstCheckSeconds: 0,
        woodBelow: RESCUE.woodBelow, woodBeforeSeconds: RESCUE.woodBeforeSeconds,
        fireBelow: RESCUE.fireBelow, feedHungerAbove: RESCUE.feedHungerAbove,
        recallSeconds: RESCUE.recallTick * FIXED_STEP_SECONDS,
        commandOrder: ['assign azhuang wood', 'assign laozhou fire', 'feed hungry NPCs', 'recall at 210s'],
      },
      commandCountDefinition: 'Actual issueCommand calls, including declined/delayed calls. appliedCommandCount counts enacted assignments/recalls and consumed meals; it is not NPC obedience.',
      comparisonLimit: 'Each rescue comparison changes only the controller for one seed/scenario/difficulty/policy. The same adaptive controller can issue different commands under different policies. No population-level or model-superiority claim.',
    },
    model: { ...model.metadata, sha256: model.manifest.sha256, manifestSha256 },
    sourceSha256: sources, sampleCount: runs.length, runs, summary: summarize(runs), rescueComparisons,
  };
  console.log(`CampMind | ${report.environment.runtime} ${process.version} ${process.platform}/${process.arch} | dt=${FIXED_STEP_SECONDS}s | ${runs.length} games | ${startedAt}`);
  console.log('Unpaced local simulation; avg_ms is Node.js inference time, not a browser or mobile benchmark.');
  console.table(runs.map(run => ({
    seed: run.seed, scenario: run.scenario, difficulty: run.difficulty, policy: run.policy,
    controller: run.controller, result: run.outcome, failure: run.failureCause ?? '-',
    sim_s: run.elapsedSeconds, score: run.score, alive: `${run.survivors}/${run.npcCount}`,
    fire: Number(run.fire.toFixed(2)), health: run.npcHealth.map(npc => npc.health.toFixed(1)).join('/'),
    decisions: run.decisionCount, fallback: run.fallbackDecisions,
    avg_ms: Number(run.avgInferenceMs.toFixed(6)), commands: run.commandCount, applied: run.appliedCommandCount,
  })));
  console.log('Same-seed unattended / rescue comparisons (actual commands are included in JSON):');
  console.table(rescueComparisons);
  console.log(`Completed ${runs.length} games in ${evaluationWallClockMs.toFixed(1)} ms wall-clock time. These are descriptive samples, not evidence that the model outperforms its teacher baseline.`);
  if (options.output) {
    const destination = resolve(options.output);
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`JSON report written: ${destination}`);
  } else console.log('No report file written. Use --output PATH to export all metrics and actual commands.');
}

// Keep failures visible to CLI callers; never replace a missing or invalid model with synthetic results.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
