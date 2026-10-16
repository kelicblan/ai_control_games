// Native compatibility test, not the final Unity AI host. Uses only a disposable
// localhost llama-server process and fixed non-player prompts; never opens saves.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const assetRoot = path.resolve(process.argv[2] ?? '.');
const output = path.resolve(process.argv[3] ?? 'native/Artifacts/minimind-smoke');
const model = path.join(assetRoot, 'public/minimind/minimind-3.q8.gguf');
const expectedHash = 'c994601ed72cb24addd206ed28ee7e8cea0283081a0434947c4e1e7a6d2ce45e';
if (createHash('sha256').update(readFileSync(model)).digest('hex') !== expectedHash) throw new Error('MiniMind3 SHA256 mismatch');
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const address = probe.address(); probe.close(error => error ? reject(error) : resolve(address.port)); });
});
const key = randomBytes(24).toString('hex');
const child = spawn(path.join(assetRoot, 'gamesoul/runtime/llama-server.exe'), ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-t', '2', '-c', '512', '-ngl', '0', '--slots', '--api-key', key], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', childError;
child.once('error', error => { childError = error; });
child.stdout.on('data', data => { log = (log + data.toString()).slice(-100000); });
child.stderr.on('data', data => { log = (log + data.toString()).slice(-100000); });
const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
const api = (route, options = {}) => fetch(`http://127.0.0.1:${port}${route}`, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(5000) });
const waitUntil = async (check, milliseconds) => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (childError) throw childError;
    if (child.exitCode !== null) throw new Error(`Native process exited early: ${child.exitCode}`);
    try { if (await check()) return; } catch (error) { if (childError) throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Native smoke deadline exceeded');
};
let report;
try {
  await waitUntil(async () => (await api('/health')).ok, 60000);
  const prompt = '<|im_start|>system\n只回答选项数字。<|im_end|>\n<|im_start|>user\n人物饥饿，需要先吃饭。选择：1.先吃饭 2.继续闲聊<|im_end|>\n<|im_start|>assistant\n';
  const response = await api('/completion', { method: 'POST', body: JSON.stringify({ prompt, n_predict: 2, temperature: 0, seed: 17, grammar: 'root ::= "1" | "2"' }) });
  if (!response.ok) throw new Error(`Generation HTTP ${response.status}`);
  const selection = (await response.json()).content.trim();
  if (!/^[12]$/.test(selection)) throw new Error('Native constrained generation invalid');
  const controller = new AbortController();
  const streaming = await api('/completion', { method: 'POST', signal: controller.signal,
    body: JSON.stringify({ prompt, stream: true, n_predict: 4096, ignore_eos: true, temperature: .8 }) });
  if (!streaming.ok || !streaming.body) throw new Error('Cancellation stream failed');
  const reader = streaming.body.getReader();
  const first = await Promise.race([reader.read(), new Promise((_, reject) => {
    const timer = setTimeout(() => { controller.abort(); reject(new Error('No streamed token within 10 seconds')); }, 10000); timer.unref();
  })]);
  if (first.done) throw new Error('Stream finished before cancellation could be exercised');
  controller.abort();
  await reader.cancel().catch(() => {});
  await waitUntil(async () => {
    const slotsResponse = await api('/slots');
    if (!slotsResponse.ok) return false;
    const slots = await slotsResponse.json();
    return slots.length > 0 && slots.every(slot => slot.is_processing === false);
  }, 10000);
  report = { version: 1, modelSha256: expectedHash, nativeProcess: 'llama-server.exe', threads: 2, context: 512,
    modelLoaded: true, constrainedSelection: selection, cancelledStreamingRequest: true, slotIdleAfterCancellation: true,
    note: 'Native process compatibility only. Unity host, IL2CPP, continuous gameplay and model quality remain unverified.' };
} finally {
  if (child.exitCode === null) child.kill();
  await exited;
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'native.log'), log.replaceAll(key, '[ephemeral-test-key]'));
}
report.processExited = true;
writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
