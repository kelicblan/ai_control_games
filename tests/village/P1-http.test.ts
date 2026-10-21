import { fork, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
it('serves the new mode in the existing service with protocol, ownership and restart boundaries', async () => {
  const root = process.cwd();mkdirSync(path.join(root,'native/Artifacts/village/P1'),{recursive:true});const dir = mkdtempSync(path.join(root, 'native/Artifacts/village/P1/http-'));
  let child: ChildProcess | undefined, endpoint = '';
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const stop = async () => { if (!child || child.exitCode !== null) return; const owned = child;
    const exit = new Promise<void>(resolve => owned.once('exit', () => resolve()));
    if (owned.connected) owned.send({ type: 'campmind-stop' });
    await Promise.race([exit, delay(5000)]); if (owned.exitCode === null) { owned.kill(); await exit; } };
  const start = async () => {
    const socket = createServer(); await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = (socket.address() as { port: number }).port; await new Promise<void>(resolve => socket.close(() => resolve())); endpoint = `http://127.0.0.1:${port}`;
    child = fork(path.join(root, 'scripts/world/server.ts'), [], { cwd: root, execArgv: ['--import', 'tsx'], windowsHide: true, silent: true,
      env: { ...process.env, CAMP_WORLD_PORT: String(port), CAMP_WORLD_DB: path.join(dir, 'world.sqlite'), CAMP_SOCIAL_OFFLINE: '1', CAMP_WORLD_OFFLINE_PROGRESS: '0', CAMP_VILLAGE_EXPERIMENTAL: '1' } });
    const log = createWriteStream(path.join(dir, `server-${port}.log`)); child.stdout!.pipe(log, { end: false }); child.stderr!.pipe(log, { end: false }); child.once('exit', () => log.end());
    for (let i = 0; i < 150; i++) { if (child.exitCode !== null) throw new Error(`Server failed: ${dir}`);
      try { if ((await fetch(endpoint + '/game-api/health', { signal: AbortSignal.timeout(500) })).ok) return; } catch {} await delay(100); }
    throw new Error('Village HTTP readiness timeout');
  };
  const player = randomUUID(), headers = { Cookie: `campmind-player=${player}`, 'X-Camp-Tab': 'p1-http', 'X-Camp-Village-Protocol': '1', 'Content-Type': 'application/json' };
  const post = (body: unknown) => fetch(endpoint + '/game-api/village', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  try {
    await start();
    expect((await fetch(endpoint + '/game-api/village', { headers: { Cookie: headers.Cookie, 'X-Camp-Tab': 'p1-http' } })).status).toBe(426);
    expect((await fetch(endpoint + '/game-api/village', { headers: { ...headers, Origin: 'http://untrusted.invalid' } })).status).toBe(403);
    const created = await post({ type: 'create', scenario: { id: 'http', classification: 'experiment', worldId: 'http-world', seed: 3, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: {} } });
    expect(created.status).toBe(200); expect((await created.json()).actors.a.personal).toBeUndefined();
    const command = { operationId: 'http-wait', actorId: 'player', action: 'WAIT', parameters: { seconds: .5 }, readSet: { 'actor:player': 0 }, source: 'player_input' };
    const receipt = await post({ type: 'command', revision: 0, command }); expect(receipt.status).toBe(200); const original = await receipt.json();
    expect((await post({ type: 'command', revision: 0, command: { ...command, operationId: 'stale' } })).status).toBe(409);
    expect(await (await fetch(endpoint + '/game-api/village', { headers: { ...headers, Cookie: `campmind-player=${randomUUID()}` } })).json()).toBeNull();
    await stop(); await start();
    expect(await (await post({ type: 'command', revision: 0, command })).json()).toEqual(original);
    const legacy = await fetch(endpoint + '/game-api/world', { headers: { ...headers, 'X-Camp-Native-Protocol': '1' } });
    expect((await legacy.json()).state).toBeNull();
  } finally { await stop(); }
}, 40000);
