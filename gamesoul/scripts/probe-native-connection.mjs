import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { appendFile } from 'node:fs/promises';

const root = process.cwd();
const log = path.join(root, 'gamesoul/logs/connection-probe.log');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function tcp(port) {
  const started = Date.now();
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    const finish = result => { socket.destroy(); resolve({ ...result, ms: Date.now() - started }); };
    socket.setTimeout(2000);
    socket.once('connect', () => finish({ connected: true }));
    socket.once('error', error => finish({ code: error.code, message: error.message }));
    socket.once('timeout', () => finish({ code: 'PROBE_TIMEOUT' }));
  });
}
async function run(label, executable, args, getPort) {
  const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data.toString(); });
  try {
    let port;
    for (let i = 0; i < 100; i++) { port = getPort(output); if (port) break; if (child.exitCode !== null) throw new Error(output); await pause(100); }
    if (!port) throw new Error('No listening port found: ' + output);
    console.log(label, { pid: child.pid, port, result: await tcp(port) });
    await appendFile(log, `\n${label}\n${output}`);
    if (label === 'native') {
      try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) }); console.log('health', response.status, await response.text()); }
      catch (error) { console.log('health error', error.message, error.cause?.code); }
    }
  } finally { child.kill(); }
}
await run('child-node', process.execPath, ['-e', `const s=require('node:net').createServer(c=>c.end('ok'));s.listen(0,'127.0.0.1',()=>console.log('port='+s.address().port));`], output => Number(output.match(/port=(\d+)/)?.[1]));
await run('native', path.join(root, 'gamesoul/runtime/llama-server.exe'), ['--models-preset', path.join(root, 'gamesoul/cache/host/models.ini'), '--no-models-autoload', '--host', '127.0.0.1', '--port', '0', '--no-webui'], output => Number(output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/)?.[1]));
