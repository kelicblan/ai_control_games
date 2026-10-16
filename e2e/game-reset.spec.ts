import { test, expect } from '@playwright/test';
import { createGame } from '../src/games/camp/simulation/engine';
import { SAVE_KEY } from '../src/games/camp/simulation/persistence';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });

test('reset confirms, handles failure, clears runtime records and survives reload', async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  // Optional local language inference is outside this reset acceptance flow.
  await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
  // This context owns a fresh cookie/world; never mutate the user's current world.
  const headers = { 'X-Camp-Tab': 'reset-e2e', 'Content-Type': 'application/json' };
  const initial = await (await page.request.get('/game-api/world', { headers })).json();
  const old = createGame({ seed: 17, mode: 'rules' }); old.status = 'paused'; old.elapsed = 123;
  old.lord!.position = { x: 59, y: 65 };
  const imported = await page.request.post('/game-api/world', { headers,
    data: { revision: initial.revision, operation: 'reset-e2e-import', action: { type: 'import', state: old } } });
  expect(imported.ok(), await imported.text()).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '游戏设置', exact: true })).toBeVisible();
  await page.evaluate(({ saveKey }) => {
    localStorage.setItem(saveKey, 'old-legacy-runtime-records');
    localStorage.setItem('campmind.camera.v1:17', JSON.stringify({ version: 1, x: 59, y: 65, azimuth: .8, elevation: .9, zoom: .45 }));
    localStorage.setItem('campmind.camera.v1:64138', 'old-default-world-view');
    localStorage.setItem('campmind-dialogue-model-v1', 'minimind3');
  }, { saveKey: SAVE_KEY });
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '游戏设置', exact: true });
  await dialog.getByRole('button', { name: '重置游戏', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/game-reset-settings.png' });
  await dialog.getByRole('button', { name: '重置游戏', exact: true }).click();
  await expect(dialog.getByText('确定清空运行记录并重新开始吗？')).toBeVisible();
  await dialog.getByRole('button', { name: '确认清空并重置' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/game-reset-confirm.png' });
  await dialog.getByRole('button', { name: '取消重置' }).click();
  expect((await (await page.request.get('/game-api/world', { headers })).json()).state.seed).toBe(17);

  let failReset = true;
  await page.route('**/game-api/world', async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action.type === 'reset' && failReset) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试：数据库写入失败' }) });
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: '重置游戏', exact: true }).click();
  await dialog.getByRole('button', { name: '确认清空并重置' }).click();
  await expect(dialog.getByRole('alert')).toContainText('数据库写入失败');
  expect((await (await page.request.get('/game-api/world', { headers })).json()).state.seed).toBe(17);
  expect(await page.evaluate(saveKey => localStorage.getItem(saveKey), SAVE_KEY)).toBe('old-legacy-runtime-records');

  failReset = false;
  const response = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().endsWith('/game-api/world') && response.request().postDataJSON().action.type === 'reset' && response.ok());
  await dialog.getByRole('button', { name: '确认清空并重置' }).click();
  const reset = await (await response).json();
  // Compare the authoritative reply at time zero before continuous simulation resumes.
  const fresh = createGame({ seed: 64138 });
  expect(reset.state.elapsed).toBe(0); expect(reset.state.lord).toEqual(fresh.lord);
  expect(reset.state.npcs).toEqual(fresh.npcs); expect(reset.state.world).toEqual(fresh.world);
  expect(reset.state.social).toEqual(fresh.social); expect(reset.state.stats).toEqual(fresh.stats);
  expect(reset.state.events).toEqual(fresh.events); expect(reset.state.decisions).toEqual([]);
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(saveKey => localStorage.getItem(saveKey), SAVE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('campmind.camera.v1:17'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('campmind-dialogue-model-v1'))).toBe('minimind3');
  await page.reload();
  await expect(page.getByRole('button', { name: '游戏设置', exact: true })).toBeVisible();
  const restored = await (await page.request.get('/game-api/world', { headers })).json();
  expect(restored.state.seed).toBe(64138); expect(restored.state.elapsed).toBeLessThan(123);
  expect(consoleErrors).toEqual([]);
});
