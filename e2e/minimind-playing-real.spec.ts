import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/games/camp/simulation/engine';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';

test.use({ serviceWorkers: 'block' });
test('real MiniMind captions are persisted and visible while the authoritative world keeps playing', async ({ page }) => {
  test.skip(process.env.NPC_REAL_TEST !== '1', 'Requires staged MiniMind GGUF'); test.setTimeout(180000);
  const headers = { 'X-Camp-Tab': 'ambient-fallback-qa', 'Content-Type': 'application/json' };
  expect((await page.request.get('/game-api/session', { headers })).ok()).toBe(true);
  const state = process.env.MODEL_QA_WORLD_FIXTURE
    ? JSON.parse(readFileSync(process.env.MODEL_QA_WORLD_FIXTURE, 'utf8')) as ReturnType<typeof createGame>
    : createGame({ seed: 64138, mode: 'rules' }); state.status = 'playing';
  for (const npc of process.env.MODEL_QA_WORLD_FIXTURE ? [] : state.npcs) {
    npc.command = 'rest'; npc.energy = 60; npc.hunger = 10;
    npc.position = { ...getTaskDestination('rest', npc.id) }; npc.destination = { ...npc.position };
    npc.speech = '我先歇会儿再说。'; npc.speechUntil = 6;
  }
  const imported = await page.request.post('/game-api/world', { headers, data: { revision: 0, operation: 'qa-import', action: { type: 'import', state } } });
  expect(imported.ok()).toBe(true);
  const remoteFailure = process.env.MODEL_QA_REMOTE_FAILURE === '1';
  let remoteCalls = 0;
  if (remoteFailure) {
    await page.route('**/game-api/remote-models', route => route.fulfill({ json: { models: [{ id: 'remote-qa', name: 'QA priority', baseUrl: 'https://example.com/v1', model: 'qa', hasKey: false }] } }));
    await page.route('**/game-api/remote-models/generate', route => {
      if (route.request().postDataJSON().test) return route.fulfill({ json: { content: '准备好了。', latencyMs: 1 } });
      remoteCalls++;
      return remoteCalls === 1 ? route.fulfill({ json: { content: '咱们先把眼前的事情说清楚吧。', latencyMs: 1 } })
        : route.fulfill({ status: 503, json: { error: 'QA forced preferred provider outage' } });
    });
  }
  await page.addInitScript(() => {
    localStorage.setItem('campmind-dialogue-model-v1', 'minimind3');
    // Keep WebGL initialization healthy but omit costly software-rendered frames.
    // World polling and real WASM inference continue on their own timers/worker.
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => new Error().stack?.includes('/assets/index-') ? 0 : frame(callback);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('worker-')) this.addEventListener('message', event => {
          const { id, type, error, outcome, value } = event.data;
          if (type !== 'progress' || value?.stage === 'ready') console.log('MODEL_QA', JSON.stringify({ id, type, error, outcome, stage: value?.stage, source: value?.source, latencyMs: value?.latencyMs }));
        });
      }
      postMessage(message: unknown, transfer?: Transferable[]) {
        const item = message as { type?: string; id?: number };
        console.log('MODEL_QA_SEND', JSON.stringify({ type: item.type, id: item.id }));
        super.postMessage(message, transfer ?? []);
      }
    };
  });
  if (remoteFailure) await page.addInitScript(() => localStorage.setItem('campmind-dialogue-model-v1', 'remote-qa'));
  let realReplies = 0, persistedCaptions = 0;
  page.on('console', message => {
    if (!message.text().startsWith('MODEL_QA')) return;
    console.log(message.text());
    if (message.text().startsWith('MODEL_QA ')) {
      const result = JSON.parse(message.text().slice('MODEL_QA '.length));
      if (result.type === 'result' && result.source === 'minimind3') realReplies++;
    }
  });
  page.on('response', async response => {
    if (!response.url().endsWith('/game-api/world') || response.request().method() !== 'POST') return;
    const { action } = response.request().postDataJSON();
    if (action?.type !== 'dialogue-result' || action.result.source !== 'minimind3') return;
    const snapshot = await response.json();
    if (snapshot.dialogues?.some((item: { id: string; source: string }) => item.id === action.result.id && item.source === 'minimind3')) persistedCaptions++;
  });
  await page.route('**/model-api/models', route => route.fulfill({ json: { models: [] } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible({ timeout: 90000 });
  // No modal is opened: the world is never temporarily paused for this acceptance.
  await expect(page.getByRole('log', { name: '世界消息' }).locator('[data-dialogue-kind="minimind3"]').first()).toBeVisible({ timeout: 90000 });
  await expect.poll(() => realReplies).toBeGreaterThan(0);
  await expect.poll(() => persistedCaptions, { timeout: 90000 }).toBeGreaterThan(2);
  const snapshot = await (await page.request.get('/game-api/world', { headers })).json();
  expect(snapshot.state.status).toBe('playing'); expect(snapshot.state.elapsed).toBeGreaterThan(state.elapsed);
  if (remoteFailure) {
    expect(remoteCalls).toBeGreaterThan(1);
    expect(snapshot.dialogues.some((item: { source: string }) => item.source === 'remote:remote-qa')).toBe(true);
  }
  await expect.poll(async () => {
    const current = await (await page.request.get('/game-api/world', { headers })).json();
    return current.dialogues?.some((item: { source: string }) => item.source === 'minimind3');
  }).toBe(true);
  await expect(page.getByRole('log', { name: '世界消息' }).locator('[data-dialogue-kind="code"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('log', { name: '世界消息' }).locator('[data-dialogue-kind="minimind3"]').first()).toBeVisible({ timeout: 90000 });
  if (process.env.MODEL_QA_SCREENSHOT_DIR) await page.getByRole('log', { name: '世界消息' }).screenshot({ path: `${process.env.MODEL_QA_SCREENSHOT_DIR}/minimind-playing-fallback.png` });
});
