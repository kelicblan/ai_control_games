import { fork, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { ensure } from '../../packages/action-runtime/src/json';
const root = process.cwd(), dir = path.join(root, 'native/Artifacts/village/P2/http-smoke-' + Date.now()); mkdirSync(dir);
let child: ChildProcess | undefined, endpoint = '';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const start = async () => {
  const socket = createServer(); await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = (socket.address() as { port: number }).port; await new Promise<void>(resolve => socket.close(() => resolve())); endpoint = `http://127.0.0.1:${port}`;
  child = fork(path.join(root, 'scripts/world/server.ts'), [], { cwd: root, execArgv: ['--import', 'tsx'], windowsHide: true, silent: true, env: { ...process.env, CAMP_WORLD_PORT: String(port), CAMP_WORLD_DB: path.join(dir, 'world.sqlite'), CAMP_WORLD_OFFLINE_PROGRESS: '0', CAMP_VILLAGE_EXPERIMENTAL: '1', CAMP_SOCIAL_OFFLINE: '1' } });
  const log = createWriteStream(path.join(dir, `server-${port}.log`)); child.stdout!.pipe(log, { end: false }); child.stderr!.pipe(log, { end: false }); child.once('exit', () => log.end());
  for (let i = 0; i < 200; i++) { ensure(child.exitCode === null, 'Owned service exited'); try { if ((await fetch(endpoint + '/game-api/health', { signal: AbortSignal.timeout(500) })).ok) return; } catch {} await delay(100); } throw new Error('HTTP smoke service not ready');
};
const stop = async () => { if (!child || child.exitCode !== null) return; const owned = child, exited = new Promise<void>(resolve => owned.once('exit', () => resolve())); owned.send({ type: 'campmind-stop' }); await Promise.race([exited, delay(5000)]); if (owned.exitCode === null) { owned.kill(); await exited; } };
const owner = randomUUID(), headers = { Cookie: `campmind-player=${owner}`, 'X-Camp-Tab': 'p2-http', 'X-Camp-Village-Protocol': '1', 'Content-Type': 'application/json' };
const post = async (body: unknown) => { const response = await fetch(endpoint + '/game-api/village', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); ensure(response.ok, `Village request failed: ${response.status}`); return response.json(); };
const read = async () => (await fetch(endpoint + '/game-api/village', { headers, signal: AbortSignal.timeout(5000) })).json();
try {
  await start();
  await post({ type: 'create', scenario: { id: 'p2-http', ruleVersion: 'p2-life-alpha-v1', classification: 'experiment', worldId: 'p2-http', seed: 17, inventory: { wood: 14, stone: 4, rope: 5, food: 10 }, actors: [{ archetypeId: 'H002', instanceId: 'worker' }] } });
  await post({ type: 'pause', revision: 0, paused: false });
  const receipt = await post({ type: 'command', revision: 1, command: { operationId: 'http-wait', actorId: 'player', action: 'WAIT', parameters: { seconds: .2 }, source: 'player_input', readSet: { 'actor:player': 0 } } });
  let snapshot = await read();
  for (let i = 0; i < 80 && snapshot.executions[receipt.executionId]?.status !== 'completed'; i++) { await delay(100); snapshot = await read(); }
  ensure(snapshot.executions[receipt.executionId]?.status === 'completed' && !snapshot.actors.worker.personal, 'HTTP execution or privacy failed');
  await stop(); const db = new DatabaseSync(path.join(dir, 'world.sqlite')); const state = JSON.parse(String(db.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get(owner)?.payload)); db.close();
  const decision = state.events.find((e: { kind: string }) => e.kind === 'policy.decision');
  const model = JSON.parse(readFileSync('public/models/village-life-alpha-v1/manifest.json', 'utf8'));
  ensure(decision?.facts.modelHash === model.sha256 && Object.values(state.executions).some((e) => (e as { command: { source: string } }).command.source === 'mlp'), 'HTTP service did not run the trained NPC model');
  await start(); const restored = await read(); ensure(restored.worldId === 'p2-http' && restored.executions[receipt.executionId].status === 'completed', 'HTTP restart restore failed');
  const report = { passed: true, worldId: restored.worldId, modelId: model.modelId, modelHash: model.sha256, playerExecution: 'completed', npcSource: 'mlp', restartRestored: true, privateNpcStateExposed: false, artifacts: dir };
  writeFileSync('native/Artifacts/village/P2/http-smoke.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await stop(); }
