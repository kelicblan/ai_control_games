import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20000 });
  await page.getByRole('button', { name: '点亮篝火，出发吧', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('controlled model resources', () => {
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page }) => {
    await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: true } }));
  });
  test('background model download never blocks immediate feedback or MLP decisions', async ({ page }) => {
    const inferenceRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('/npc-api/')) inferenceRequests.push(request.url()); });
    let release!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/*.gguf', async route => { await blocked; await route.fulfill({ body: 'incomplete' }).catch(() => {}); });
    await start(page);
    await expect(page.locator('.npc-speech[data-speech-source="template"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('campmind-save-v1') ?? '{"state":{"elapsed":0}}').state.elapsed)).toBeGreaterThan(1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('campmind-save-v1')!).state);
    expect(saved.stats.modelDecisions).toBeGreaterThan(0);
    await page.getByRole('button', { name: '营地选项', exact: true }).click();
    await expect(page.getByRole('region', { name: '伙伴台词' })).toContainText('后台下载模型');
    expect(inferenceRequests).toEqual([]); release();
  });

  test('corrupt model falls back with independent switch and no service request', async ({ page }) => {
    await page.route('**/*.gguf', route => route.fulfill({ body: 'corrupt model' }));
    const inferenceRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('/npc-api/')) inferenceRequests.push(request.url()); });
    await start(page);
    await page.getByRole('button', { name: '营地选项', exact: true }).click();
    const section = page.getByRole('region', { name: '伙伴台词' });
    await expect(section).toContainText('暂用即时回应');
    await section.getByRole('button', { name: 'MiniMind3 开', exact: true }).click();
    await expect(section.getByRole('button', { name: 'MiniMind3 关', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(inferenceRequests).toEqual([]);
  });

});

test.describe('optional model deployment', () => {
  test.use({ serviceWorkers: 'block' });
  test('a build without optional model resources stays playable without resource errors', async ({ page }) => {
    const errors: string[] = [], models: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (request.url().endsWith('.gguf')) models.push(request.url()); });
    await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
    await start(page);
    await page.getByRole('button', { name: '营地选项', exact: true }).click();
    await expect(page.getByRole('region', { name: '伙伴台词' })).toContainText('暂用即时回应');
    expect(models).toEqual([]); expect(errors).toEqual([]);
  });

});

test('real WASM model generates a paused social reply and reloads from offline cache', async ({ page, context }) => {
  test.skip(process.env.NPC_REAL_TEST !== '1', 'Requires staged MiniMind GGUF');
  test.setTimeout(180000);
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await start(page);
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  const section = page.getByRole('region', { name: '伙伴台词' });
  await expect(section).toContainText('本地 WASM 模型已就绪', { timeout: 90000 });
  await expect(section).toContainText('模型已保存到本地缓存');
  await page.getByRole('button', { name: '主动聊聊', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '营地对话', exact: true });
  // Rejected sampling is an expected template fallback, not a guarantee of a model line per input.
  const followups = ['我听着，你慢慢说。', '你现在有什么感受？', '我们先聊聊现在的天气。'];
  for (let attempt = 0; ; attempt++) {
    try {
      await expect(dialog.locator('[data-dialogue-source="minimind3"]').first()).toBeVisible({ timeout: 12000 });
      break;
    } catch (error) {
      if (attempt >= followups.length) throw error;
      await dialog.getByLabel('想对伙伴说的话').fill(followups[attempt]);
      await dialog.getByRole('button', { name: '发送', exact: true }).click();
    }
  }
  await expect(dialog.locator('.social-choice:not([disabled])').first()).toBeEnabled();
  await page.screenshot({ path: 'test-results/minimind-wasm-desktop.png' });
  expect(requests.some(url => url.endsWith('.wasm'))).toBe(true);
  expect(requests.filter(url => url.includes('/npc-api/'))).toEqual([]);
  expect(requests.filter(url => /^https?:/.test(url) && !url.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames.some(name => name.startsWith('minimind-model-'))).toBe(true);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Game shell/runtime use its fixed offline cache; model uses a separate hash-keyed cache.
  requests.length = 0; await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 30000 });
  await page.getByRole('dialog').getByRole('button', { name: /^继续上一次旅程/ }).click();
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await expect(section).toContainText('本地 WASM 模型已就绪', { timeout: 90000 });
  await expect(section).toContainText('已从本地缓存加载');
  expect(requests.filter(url => url.endsWith('.gguf'))).toEqual([]);
  expect(errors).toEqual([]);
});
