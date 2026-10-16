import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test('a failed remote request produces a visible, persisted caption from the real MiniMind Worker', async ({ page }) => {
  test.skip(process.env.NPC_REAL_TEST !== '1', 'Requires staged MiniMind GGUF'); test.setTimeout(180000);
  await page.addInitScript(() => {
    localStorage.setItem('campmind-dialogue-model-v1', 'remote-fallback-qa');
    // Model/UI/data-path acceptance does not require costly software WebGL rendering.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type: string, ...args: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  const headers = { 'X-Camp-Tab': 'fallback-qa', 'Content-Type': 'application/json' };
  expect((await page.request.get('/game-api/session', { headers })).ok()).toBe(true);
  const saved = await page.request.post('/game-api/remote-models', { headers, data: { action: 'save', config: {
    id: 'remote-fallback-qa', name: '故障远程接口', baseUrl: 'https://provider.example/v1', model: 'controlled-failure',
  } } }); expect(saved.ok()).toBe(true);
  await page.route('**/model-api/models', route => route.fulfill({ json: { models: [] } }));
  let failures = 0;
  await page.route('**/game-api/remote-models/generate', route => {
    if (route.request().postDataJSON().test) return route.fulfill({ json: { content: '准备好了。', latencyMs: 1 } });
    failures++; return route.fulfill({ status: 503, json: { error: '受控远程故障' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '游戏设置 · 对话模型', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '游戏设置', exact: true });
  await expect(settings.locator('[data-mini-stage]')).toHaveAttribute('data-mini-stage', 'ready', { timeout: 60000 });
  await expect(settings.locator('[data-preferred-stage]')).toHaveAttribute('data-preferred-stage', 'ready');
  await settings.getByRole('button', { name: '返回游戏', exact: true }).click();
  await page.getByRole('button', { name: /^(进入村寨|开始村寨生活|重新开始一段村寨生活|点亮篝火，出发吧)$/ }).click();
  await page.getByRole('button', { name: '选择阿壮', exact: true }).click();
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await page.getByRole('button', { name: '主动聊聊', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '营地对话', exact: true });
  await expect.poll(() => failures).toBeGreaterThan(0);
  await expect(dialog.locator('[data-dialogue-source="minimind3"]').first()).toBeVisible({ timeout: 60000 });
  await expect(dialog.getByRole('img', { name: 'MiniMind3', exact: true }).first()).toBeVisible();
  await expect.poll(async () => {
    const snapshot = await (await page.request.get('/game-api/world', { headers })).json();
    return snapshot.state?.social.threads.some((thread: { lines: { source: string }[] }) => thread.lines.some(line => line.source === 'minimind3'));
  }).toBe(true);
  if (process.env.MODEL_QA_SCREENSHOT_DIR) await dialog.screenshot({ path: `${process.env.MODEL_QA_SCREENSHOT_DIR}/minimind-real-fallback.png` });
});
