// Run against the live service or same-origin Vite proxy, never a mock model.
const base = (process.argv[2] ?? 'http://127.0.0.1:8765').replace(/\/$/, '');
const health = await fetch(`${base}/health`).then(response => response.json());
if (!health.ready || health.model !== 'minimind-3-q8') throw new Error('Actual MiniMind service is unavailable');
const results = [];
const recent = [];
for (let index = 0; index < 10; index++) {
  const start = performance.now();
  const response = await fetch(`${base}/speech`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: `smoke-${index}`, npcId: 'xiaomi', name: '小米', persona: '谨慎的观察者',
      action: 'rest', emotion: 'worried', event: '我得先休息一下。',
      facts: ['天气雷暴', '已决定休息恢复', '情绪担心', '精疲力尽'], memories: [], recentLines: recent.slice(-5) }),
    signal: AbortSignal.timeout(5000),
  });
  const reply = await response.json();
  results.push({ status: response.status, httpMs: Math.round(performance.now() - start), ...reply });
  if (response.ok && reply.source === 'minimind3') recent.push(reply.text);
}
const success = results.filter(result => result.status === 200 && result.source === 'minimind3');
if (success.length < 2 || new Set(success.map(result => result.text)).size < 2) {
  console.log(JSON.stringify({ base, results }, null, 2));
  throw new Error('Insufficient distinct actual model output');
}
console.log(JSON.stringify({ base, attempts: results.length, accepted: success.length,
  modelMs: success.map(result => result.latencyMs), results }, null, 2));
