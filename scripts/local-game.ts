import { fork, spawnSync } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const session = option('session', 'default');
if (!/^[a-z0-9-]{1,40}$/.test(session)) throw new Error('Invalid session');
const file = path.join(root, 'data', `local-game-${session}.json`);
type Control = { root: string; port: number; token: string };
const control = () => JSON.parse(readFileSync(file, 'utf8')) as Control;

async function stop() {
  if (!existsSync(file)) {
    if (session === 'default' && process.platform === 'win32') {
      const result = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/stop-legacy-local.ps1')], { stdio: 'inherit', windowsHide: true });
      if (result.status !== 0) throw new Error('Legacy services were not stopped');
    } else console.log('Game is already stopped.');
    return;
  }
  const saved = control();
  if (saved.root !== root) throw new Error('Control file belongs to another project');
  const response = await fetch(`http://127.0.0.1:${saved.port}/stop`, { method: 'POST', headers: { Authorization: `Bearer ${saved.token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Game stop was rejected');
  console.log('Game and world service stopped.');
}
async function free(port: number, host: string) {
  await new Promise<void>((resolve, reject) => {
    const probe = netServer(); probe.once('error', reject);
    probe.listen(port, host, () => probe.close(() => resolve()));
  }).catch(() => { throw new Error(`Port ${port} is occupied. Run npm stop before npm start; existing services are never silently reused.`); });
}
async function start() {
  if (existsSync(file)) {
    const saved = control();
    try {
      const response = await fetch(`http://127.0.0.1:${saved.port}/health`, { headers: { Authorization: `Bearer ${saved.token}` }, signal: AbortSignal.timeout(1000) });
      if (response.ok) throw new Error('Game is already running. Use npm stop first.');
    } catch (error) { if (error instanceof Error && error.message.startsWith('Game is already')) throw error; }
    unlinkSync(file);
  }
  const port = Number(option('port', '5173')), worldPort = Number(option('world-port', process.env.CAMP_WORLD_PORT ?? '18081'));
  if (![port, worldPort].every(value => Number.isInteger(value) && value > 0 && value <= 65535) || port === worldPort) throw new Error('Invalid service ports');
  await free(port, '0.0.0.0'); await free(worldPort, '127.0.0.1');
  process.env.CAMP_WORLD_PORT = String(worldPort);
  process.env.CAMP_WORLD_MANAGED = '1';
  const world = fork(path.join(root, 'scripts/world/server.ts'), [], {
    cwd: root, execArgv: ['--import', 'tsx'], windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: process.env,
  });
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  let closing: Promise<void> | undefined;
  const token = randomUUID();
  const api = httpServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403).end(); return; }
    if (request.url === '/health' && request.method === 'GET') { response.end('ready'); return; }
    if (request.url === '/stop' && request.method === 'POST') {
      void shutdown().then(() => { response.end('stopped'); api.close(); }); return;
    }
    response.writeHead(404).end();
  });
  const exited = new Promise<void>(resolve => world.once('exit', () => resolve()));
  const shutdown = () => closing ??= (async () => {
    try { await vite?.close(); } finally {
      if (world.exitCode === null && world.signalCode === null) {
        if (world.connected) world.send({ type: 'campmind-stop' }, () => {});
        const timer = setTimeout(() => world.kill(), 5000);
        await exited; clearTimeout(timer);
      }
      if (existsSync(file) && control().token === token) unlinkSync(file);
    }
  })();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void shutdown().finally(() => api.close()); });
  process.once('disconnect', () => { void shutdown().finally(() => api.close()); });
  process.channel?.unref();
  world.once('exit', () => { if (!closing) { process.exitCode = 1; void shutdown().finally(() => api.close()); } });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (world.exitCode !== null || world.signalCode !== null) throw new Error('World service exited during startup');
      try {
        const health = await fetch(`http://127.0.0.1:${worldPort}/game-api/health`, { signal: AbortSignal.timeout(300) });
        const value = await health.json();
        if (value.root === root && value.service === 'campmind-world-v1') { ready = true; break; }
      } catch { /* wait for our child */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready || closing) throw new Error('World service did not become ready');
    vite = await createServer({ root, server: { port, strictPort: true } });
    if (closing) { await vite.close(); throw new Error('Startup cancelled'); }
    await vite.listen();
    if (closing) { await vite.close(); throw new Error('Startup cancelled'); }
    await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ root, port: (api.address() as { port: number }).port, token }), { mode: 0o600 });
    console.log(`Game: http://localhost:${port} | Ctrl+C or npm stop closes game AND world.`);
  } catch (error) { await shutdown(); api.close(); throw error; }
}
try {
  const command = process.argv[2] ?? 'start';
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else throw new Error('Use start or stop');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  // start() has already awaited child shutdown. Vite may leave file watchers behind
  // when configuration throws before createServer returns an instance to close.
  process.exit(1);
}
