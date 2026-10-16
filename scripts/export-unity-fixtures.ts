import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceGameSteps, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { restoreGameState } from '../src/games/camp/simulation/persistence';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { acceptAppraisal, appraisalSignature, type AppraisalTicket } from '../src/games/camp/npc/appraisal';
import { ensureAgency, remember } from '../src/games/camp/npc/experience';
import type { GameCommand, GameState, PolicyObservation, PolicyResult } from '../src/games/camp/simulation/types';

export function canonicalJson(value: unknown): string {
  function normalize(item: unknown): unknown {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Expected finite numeric data');
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([, child]) => child !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, normalize(child)]));
    if (item === undefined || typeof item === 'bigint' || typeof item === 'function') throw new Error('Unsupported fixture data');
    return item;
  }
  return JSON.stringify(normalize(value));
}
export const stateDigest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
type Operation = { kind: 'advance'; steps: number } | { kind: 'command'; command: GameCommand }
  | { kind: 'restore' } | { kind: 'appraisal'; ticket: AppraisalTicket; raw: string };
interface PolicyCall { observation: PolicyObservation; result: PolicyResult }
interface Checkpoint { operation: number; sha256: string; state: GameState }
export interface MigrationFixture {
  version: 1; id: string; stepSeconds: 0.1; policy: 'teacher-v3-zero-latency';
  initialState: GameState; operations: Operation[]; checkpoints: Checkpoint[];
  policyCalls: PolicyCall[]; appraisalChecks: { accepted: boolean; stateUnchanged: boolean }[];
}

function execute(fixture: MigrationFixture, verify: boolean) {
  let state = structuredClone(fixture.initialState), callIndex = 0;
  const checkpoints: Checkpoint[] = [], policyCalls: PolicyCall[] = [], appraisalChecks: MigrationFixture['appraisalChecks'] = [];
  const capture = (operation: number) => {
    const checkpoint = { operation, sha256: stateDigest(state), state: structuredClone(state) };
    if (verify && canonicalJson(checkpoint) !== canonicalJson(fixture.checkpoints[checkpoints.length])) throw new Error(`${fixture.id}: checkpoint ${operation} mismatch`);
    checkpoints.push(checkpoint);
  };
  capture(-1);
  for (const [index, operation] of fixture.operations.entries()) {
    switch (operation.kind) {
      case 'command': state = issueCommand(state, operation.command); break;
      case 'advance': state = advanceGameSteps(state, operation.steps, observation => {
        const result = { ...baselinePolicy(observation), latencyMs: 0 };
        const call = { observation: structuredClone(observation), result };
        callIndex++; policyCalls.push(call); return result;
      }); break;
      case 'restore': {
        const restored = restoreGameState(state);
        if (!restored) throw new Error(`${fixture.id}: restore rejected`);
        state = restored; break;
      }
      case 'appraisal': {
        const before = stateDigest(state);
        const accepted = acceptAppraisal(state, operation.ticket, operation.raw) !== null;
        appraisalChecks.push({ accepted, stateUnchanged: before === stateDigest(state) }); break;
      }
    }
    // The engine catches policy exceptions as normal fallback behavior. Verify outside
    // that callback so a parity mismatch cannot be swallowed and turned into fallback.
    if (verify && canonicalJson(policyCalls) !== canonicalJson(fixture.policyCalls.slice(0, callIndex))) throw new Error(`${fixture.id}: policy trace mismatch`);
    capture(index);
  }
  if (verify && (checkpoints.length !== fixture.checkpoints.length || callIndex !== fixture.policyCalls.length
    || canonicalJson(appraisalChecks) !== canonicalJson(fixture.appraisalChecks))) throw new Error(`${fixture.id}: replay record count mismatch`);
  return { checkpoints, policyCalls, appraisalChecks };
}

export function replayFixture(fixture: MigrationFixture): Checkpoint[] {
  if (fixture.version !== 1 || fixture.stepSeconds !== .1 || fixture.policy !== 'teacher-v3-zero-latency') throw new Error('Unsupported replay version');
  return execute(fixture, true).checkpoints;
}

export function buildMigrationFixtures(): MigrationFixture[] {
  const fresh = () => ({ ...createGame({ seed: 17, mode: 'rules' }), status: 'playing' as const });
  const advance: Operation = { kind: 'advance', steps: 20 };
  const command = (value: GameCommand): Operation => ({ kind: 'command', command: value });
  const fixtures: MigrationFixture[] = [];
  const add = (id: string, initialState: GameState, operations: Operation[]) => {
    const fixture: MigrationFixture = { version: 1, id, stepSeconds: .1, policy: 'teacher-v3-zero-latency', initialState,
      operations, checkpoints: [], policyCalls: [], appraisalChecks: [] };
    Object.assign(fixture, execute(fixture, false)); fixtures.push(fixture);
  };
  add('new-world', fresh(), [advance]);
  const shortage = fresh(); shortage.food = 0; shortage.npcs.forEach(n => { n.hunger = 82; });
  add('food-shortage', shortage, [command({ type: 'priority', priority: 'wood' }), advance]);
  const death = fresh(); death.npcs.find(n => n.id === 'linlan')!.health = 0;
  add('npc-death-world-continues', death, [advance, advance]);
  add('social-work', fresh(), [command({ type: 'social-open', npcId: 'aye', topic: 'food' }), advance]);
  add('storm-transition', fresh(), [command({ type: 'weather', weather: 'storm' }), advance]);
  add('restart-held-input', fresh(), [command({ type: 'lord-input', direction: { x: 1, y: 0 } }), advance, { kind: 'restore' }, advance]);
  const legacy = fresh(); delete legacy.world; delete legacy.lord;
  add('legacy-missing-world-lord', legacy, [{ kind: 'restore' }, advance]);
  const expired = fresh(); expired.elapsed = 100; ensureAgency(expired);
  const evidence = remember(expired, 'azhuang', 'body', '本人感到饥饿，需要先补充食物。', 'azhuang', ['azhuang'], 'experienced', '', .5, 0);
  const ticket: AppraisalTicket = { id: 'expired-test', player: 'fixture-player', generation: 'fixture-generation', branch: 'fixture-branch',
    npcId: 'azhuang', at: 0, through: evidence.sequence, settingsRevision: 0, signature: appraisalSignature(expired.npcs[0], expired), evidence: [evidence], targets: [] };
  const raw = JSON.stringify({ version: 1, summary: '需要先补充食物。', evidenceIds: [evidence.eventId], goal: '先吃饭',
    emotionAssessment: { anger: .1, resentment: .1, stress: .2 }, preferences: { bargain: .2 }, expression: { text: '我先吃点东西。', targetId: null } });
  add('expired-ai-result', expired, [{ kind: 'appraisal', ticket, raw }, advance]);
  return fixtures;
}

export function writeMigrationFixtures(directory: string) {
  mkdirSync(directory, { recursive: true });
  const fixtures = buildMigrationFixtures();
  for (const fixture of fixtures) writeFileSync(path.join(directory, `${fixture.id}.json`), canonicalJson(fixture) + '\n');
  const manifest = { version: 1, source: 'TypeScript CampMind authority', stepSeconds: .1, policy: 'teacher-v3-zero-latency',
    note: 'Core rule fixtures; no real LLM load or SQLite lifecycle implied. Not a native parity result.',
    fixtures: fixtures.map(f => ({ id: f.id, file: `${f.id}.json`, sha256: stateDigest(f), checkpoints: f.checkpoints.length, policyCalls: f.policyCalls.length })) };
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = writeMigrationFixtures(path.resolve(process.argv[2] ?? 'contracts/migration/fixtures'));
  console.log(`Exported ${manifest.fixtures.length} deterministic rule fixtures`);
}
