import { expect, test } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { buildCaptionPrompt } from '../src/games/camp/dialogue/language';
import { cleanCaption } from '../src/games/camp/dialogue/language';
import { buildFallbackSelection } from '../src/games/camp/dialogue/fallback-selection';

test.use({ serviceWorkers: 'block' });
test('real MiniMind Worker completes inference independently of scene rendering', async ({ page }) => {
  test.skip(process.env.NPC_REAL_TEST !== '1', 'Requires staged MiniMind GGUF'); test.setTimeout(120000);
  const file = (await readdir('dist/assets')).find(name => /^worker-.*\.js$/.test(name)); expect(file).toBeTruthy();
  await page.route('**/__minimind_probe__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>MiniMind runtime probe</title>' }));
  await page.goto('/__minimind_probe__');
  const payload = { requestId: 'real-probe', npcId: 'azhuang', name: '阿壮', persona: '好强、讲义气，不喜欢被催促', action: 'camp', emotion: 'calm',
    event: '有事尽管叫我。也想听听你怎么安排大家。', facts: ['天气晴朗', '已决定回应玩家', '情绪平静', '不饿', '体力充足', '身体正常', '信任玩家'], memories: [], recentLines: [],
    playerText: '我听着，你慢慢说。', socialContext: ['听听彼此的想法', '明确安排可能已经影响立场；只表达当前事实。'],
    privateIntent: 'participate：把这轮怎么干商量清楚', publicExpression: { kind: 'request', tone: 'warm', reason: '希望大家协作', allowDeception: false } };
  const prompt = buildCaptionPrompt(payload), fallbackSelection = buildFallbackSelection(payload);
  const result = await page.evaluate(async ({ asset, prompt, fallbackSelection }) => {
    const worker = new Worker(asset, { type: 'module' });
    const call = (data: unknown) => new Promise<{ type: string; value?: { text: string }; outcome?: string; error?: string }>((resolve, reject) => {
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker inference did not complete within 60 seconds')); }, 60000);
      worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
      worker.onmessage = event => { if (event.data.type !== 'progress') { clearTimeout(timer); resolve(event.data); } };
      worker.postMessage(data);
    });
    try {
      const prepared = await call({ id: 1, type: 'prepare', base: `${location.origin}/` });
      if (prepared.type !== 'result') throw new Error(prepared.error ?? 'prepare failed');
      const started = performance.now();
      const reply = await call({ id: 2, type: 'generate', payload: { requestId: 'real-probe', prompt, fallbackSelection } });
      return { ...reply, promptCharacters: prompt.length, elapsedMs: performance.now() - started };
    } finally { worker.terminate(); }
  }, { asset: `/assets/${file}`, prompt, fallbackSelection });
  console.log('Real MiniMind worker:', JSON.stringify(result));
  expect(result.type).toBe('result');
  expect(cleanCaption(result.value!.text, payload)).toBe(result.value!.text);
  expect(fallbackSelection!.choices).toContain(result.value!.text);
});
