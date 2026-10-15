import { test, expect } from '@playwright/test';
import { createGame } from '../src/games/camp/simulation/engine';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 } });
test('world connection notices share the bottom-left dismissible notification area', async ({ page }) => {
  let error = '';
  const state = { ...createGame({ mode: 'rules', seed: 64138 }), status: 'paused' };
  await page.addInitScript(() => localStorage.setItem('campmind-dialogue-model-v1', 'qwen3.5-0.8b'));
  await page.route('**/model-api/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
    const result = endpoint === 'models' ? { models: [{ id: 'qwen3.5-0.8b', name: '测试模型', backend: 'native', available: true }] }
      : endpoint === 'select' ? { operation: 1 } : { id: 'qwen3.5-0.8b', operation: 1, stage: 'ready', progress: 1 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.route('**/game-api/world', async route => {
    await route.fulfill({ status: error ? 503 : 200, contentType: 'application/json', body: JSON.stringify(error ? { error } : {
      state, revision: 1, speed: 1, savedAt: Date.now(), recovered: false, temporaryPause: false, catchingUp: false,
    }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /继续上一次旅程/ }).click();
  error = '测试存档连接中断';
  const notice = page.getByRole('alert').filter({ hasText: '存档连接异常' });
  await expect(notice).toBeVisible();
  const bounds = await notice.boundingBox();
  expect(bounds!.x).toBe(16);
  expect(Math.round(bounds!.y + bounds!.height)).toBe(704);
  await notice.getByRole('button', { name: '关闭存档连接异常提示', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('button', { name: '游戏设置', exact: true })).toBeVisible();
  error = '';
  await expect.poll(() => page.locator('.game-notices').getAttribute('data-active-count')).toBe('0');
  error = '再次测试存档连接中断';
  await expect(notice).toContainText(error);
  await page.screenshot({ path: 'docs/screenshots/world-notice-bottom-left.png' });
  await notice.getByRole('button', { name: '关闭存档连接异常提示', exact: true }).click();
  await expect(notice).toHaveCount(0);
});
