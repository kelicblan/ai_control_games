import { test, expect, type Page } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.setTimeout(150000);

// Controlled bridge responses validate UI/state transitions; these are not native inference evidence.
async function bridge(page: Page, failFirst = false) {
  let id: string | null = null, operation = 0, polls = 0, selects = 0;
  const requests: string[] = [];
  await page.route('**/model-api/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.split('/').at(-1)!;
    requests.push(endpoint);
    const data = request.method() === 'POST' ? request.postDataJSON() : {};
    let result: unknown = {};
    if (endpoint === 'models') result = { models: [{ id: 'qwen3.5-0.8b', name: 'Qwen3.5 · 0.8B', backend: 'native', threads: 20, available: true }, { id: 'extra-model', name: '其他本地模型', backend: 'native', threads: 4, available: true }] };
    if (endpoint === 'select') { id = data.id; polls = 0; selects++; result = { operation: ++operation }; }
    if (endpoint === 'status') { polls++; result = { id, operation, stage: failFirst && selects === 1 ? 'error' : polls > 5 ? 'ready' : 'load', progress: polls > 5 ? 1 : polls / 6, error: '测试模型加载失败' }; }
    if (endpoint === 'unload' && id === data.id) { id = null; operation++; }
    if (endpoint === 'generate') result = { content: '我想先歇会儿再说。', latencyMs: 25 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  return requests;
}
async function settings(page: Page) {
  await page.getByRole('button', { name: '游戏设置 · 对话模型', exact: true }).click();
  return page.getByRole('dialog', { name: '游戏设置', exact: true });
}
test('game-level selection immediately loads, shows progress and survives reload (controlled bridge)', async ({ page }) => {
  const requests = await bridge(page); await page.goto('/'); const dialog = await settings(page);
  await expect(dialog.getByRole('button', { name: '不使用优先模型', exact: false })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).click();
  await expect(dialog.getByRole('progressbar', { name: '优先模型加载进度' })).toBeVisible();
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
  expect(requests).toContain('select');
  await page.reload(); const reopened = await settings(page);
  await expect(reopened.getByRole('button', { name: /Qwen3.5 · 0.8B/ })).toHaveAttribute('aria-pressed', 'true');
  await reopened.getByRole('button', { name: '其他本地模型', exact: false }).click();
  await reopened.getByRole('button', { name: '不使用优先模型', exact: false }).click();
  await expect(reopened.getByRole('button', { name: '不使用优先模型', exact: false })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('campmind-dialogue-model-v1'))).toBe('minimind3');
  await expect(reopened.getByRole('button', { name: '返回游戏', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('failed native load stays selected, offers retry and can recover (controlled bridge)', async ({ page }) => {
  await bridge(page, true); await page.goto('/'); const dialog = await settings(page);
  await dialog.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('测试模型加载失败');
  await expect(dialog.getByRole('button', { name: /Qwen3.5 · 0.8B/ })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
});
test('priority retries are bounded while MiniMind remains available; explicit retry resets budget', async ({ page }) => {
  let selects = 0, operation = 0;
  await page.route('**/model-api/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
    const result = endpoint === 'models' ? { models: [{ id: 'qwen3.5-0.8b', name: 'Qwen3.5 · 0.8B', backend: 'native', available: true }] }
      : endpoint === 'select' ? (selects++, { operation: ++operation })
        : endpoint === 'status' ? { id: 'qwen3.5-0.8b', operation, stage: 'error', progress: null, error: '测试连接失败' } : {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/'); const dialog = await settings(page);
  await expect(dialog.locator('[data-mini-stage]')).toHaveAttribute('data-mini-stage', 'ready', { timeout: 60000 });
  await page.clock.install();
  await dialog.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).click();
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'error');
  for (let retry = 0; retry < 2; retry++) {
    await page.clock.fastForward(30010);
    await expect.poll(() => selects).toBeGreaterThanOrEqual(retry + 2);
    await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'error');
  }
  await expect(dialog).toContainText('自动重试已停止');
  await page.clock.fastForward(60000); expect(selects).toBe(3);
  await expect(dialog).toContainText('当前使用：MiniMind3');
  await expect(page.locator('.dialogue-model-failure')).toHaveCount(0);
  await dialog.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect.poll(() => selects).toBe(4);
});

test('preloads real MiniMind before starting a game and refresh reuses cached weights', async ({ page }) => {
  const errors: string[] = [], downloads: string[] = [], manifests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().endsWith('.gguf')) downloads.push(r.url()); if (r.url().endsWith('/minimind/model.json')) manifests.push(r.url()); });
  await bridge(page); await page.goto('/'); let dialog = await settings(page);
  await expect(dialog.locator('[data-mini-stage]')).toHaveAttribute('data-mini-stage', 'ready', { timeout: 60000 });
  await expect(dialog).toContainText('权重已保存在本地'); expect(downloads).toHaveLength(1);
  const names = await page.evaluate(() => caches.keys()); expect(names.some(n => n.startsWith('minimind-model-'))).toBe(true);
  await dialog.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).click();
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
  await expect(dialog.locator('[data-mini-stage]')).toHaveAttribute('data-mini-stage', 'ready');
  downloads.length = 0; manifests.length = 0;
  await page.route('**/minimind/model.json', route => route.fulfill({ status: 503, body: 'manifest unavailable' }));
  await page.reload(); dialog = await settings(page);
  await expect(dialog.locator('[data-mini-stage]')).toHaveAttribute('data-mini-stage', 'ready', { timeout: 60000 });
  await expect(dialog).toContainText('已复用本地模型缓存'); expect(downloads).toHaveLength(0);
  expect(manifests).toHaveLength(0);
  if (process.env.MODEL_QA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.MODEL_QA_SCREENSHOT_DIR}/model-cache.png` });
  expect(errors).toEqual([]);
});

test('remote config persists in the player database and refresh reuses credentials (controlled provider)', async ({ page }) => {
  // This scenario verifies settings/database persistence, independently of software WebGL scene cost.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await bridge(page);
  const remoteRequests: Record<string, unknown>[] = [];
  let failTest = true;
  await page.route(/\/game-api\/remote-models\/(test|generate)$/, async route => {
    remoteRequests.push(route.request().postDataJSON());
    if (failTest) { await route.fulfill({ status: 503, json: { error: '远程模型请求失败（HTTP 401）' } }); return; }
    await route.fulfill({ json: { content: '连接已经准备好了。', latencyMs: 2 } });
  });
  await page.goto('/'); let dialog = await settings(page);
  await dialog.getByRole('button', { name: '添加远程模型', exact: true }).click();
  await dialog.getByLabel('配置名称', { exact: true }).fill('远程测试模型');
  await dialog.getByLabel('接口地址', { exact: true }).fill('https://provider.example/v1');
  await dialog.getByLabel('模型 ID', { exact: true }).fill('small-model');
  await dialog.getByLabel('API Key', { exact: true }).fill('fake-test-key');
  await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect.poll(() => remoteRequests.length).toBe(1);
  await expect(dialog.locator('.remote-model-form [role="alert"]')).toContainText('HTTP 401');
  failTest = false;
  await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(dialog.locator('.remote-model-form [role="status"]')).toContainText('连接成功');
  await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await dialog.getByRole('button', { name: /远程测试模型 远程接口/ }).click();
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
  await expect(dialog).toContainText('当前使用：远程测试模型');
  expect(remoteRequests).toHaveLength(3);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fake-test-key');
  await page.reload(); dialog = await settings(page);
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
  await expect(dialog).toContainText('当前使用：远程测试模型');
  expect(remoteRequests.at(-1)).not.toHaveProperty('apiKey');
  await dialog.getByRole('button', { name: '编辑 远程测试模型', exact: true }).click();
  await dialog.getByLabel('配置名称', { exact: true }).fill('已改名远程模型');
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute('placeholder', '已保存到数据库，留空保留');
  if (process.env.MODEL_QA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.MODEL_QA_SCREENSHOT_DIR}/remote-database.png` });
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog).toContainText('当前使用：已改名远程模型');
  await dialog.getByRole('button', { name: '删除 已改名远程模型', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '不使用优先模型', exact: false })).toHaveAttribute('aria-pressed', 'true');
});

test('a remote generation fault returns routing to MiniMind without losing the preference', async ({ page }) => {
  test.setTimeout(150000); await bridge(page); let generations = 0;
  await page.route('**/game-api/remote-models/generate', async route => {
    const data = route.request().postDataJSON();
    if (data.test && generations === 0) await route.fulfill({ json: { content: '连接已准备好了。', latencyMs: 1 } });
    else { if (!data.test) generations++; await route.fulfill({ status: 503, json: { error: '远程模型请求失败（HTTP 503）' } }); }
  });
  await page.goto('/'); const dialog = await settings(page);
  await expect(dialog.locator('[data-mini-stage]')).toHaveAttribute('data-mini-stage', 'ready', { timeout: 60000 });
  await dialog.getByRole('button', { name: '添加远程模型', exact: true }).click();
  await dialog.getByLabel('配置名称', { exact: true }).fill('故障远程模型');
  await dialog.getByLabel('接口地址', { exact: true }).fill('https://provider.example/v1');
  await dialog.getByLabel('模型 ID', { exact: true }).fill('small-model');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await dialog.getByRole('button', { name: /故障远程模型 远程接口/ }).click();
  await expect(dialog.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
  await dialog.getByRole('button', { name: '返回游戏', exact: true }).click();
  await page.getByRole('button', { name: /^(进入村寨|开始村寨生活|重新开始一段村寨生活)$/ }).click();
  await expect.poll(() => generations, { timeout: 30000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  const reopened = page.getByRole('dialog', { name: '游戏设置', exact: true });
  await expect(reopened.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'error');
  await expect(reopened).toContainText('当前使用：MiniMind3');
  await expect(reopened.getByRole('button', { name: /故障远程模型 远程接口/ })).toHaveAttribute('aria-pressed', 'true');
  if (process.env.MODEL_QA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.MODEL_QA_SCREENSHOT_DIR}/remote-generation-fallback.png` });
});
