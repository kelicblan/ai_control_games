import { test, expect } from '@playwright/test';
import { createGame } from '../src/games/camp/simulation/engine';
import { getCampClock } from '../src/games/camp/simulation/clock';
// Keep the controlled API route authoritative across reloads; production caching is tested separately.
test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 } });

for (const [elapsed, period, label, path] of [[210, 'noon', '中午', 'daylight-sun-shadows'], [500, 'night', '晚上', 'night-period']] as const) test(`period badge and ${period} lighting (controlled world)`, async ({ page }) => {
  // Avoid loading a language model during a rendering-only test.
  await page.addInitScript(() => localStorage.setItem('campmind-dialogue-model-v1', 'qwen3.5-0.8b'));
  await page.route('**/model-api/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
    const result = endpoint === 'models' ? { models: [{ id: 'qwen3.5-0.8b', name: '视觉测试模型', backend: 'native', available: true }] }
      : endpoint === 'select' ? { operation: 1 } : { id: 'qwen3.5-0.8b', operation: 1, stage: 'ready', progress: 1 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.route('**/game-api/world', async route => {
    const state = createGame({ mode: 'rules', seed: 64138 });
    Object.assign(state, { elapsed, day: getCampClock(elapsed).day, status: 'paused' });
    state.atmosphere.cloudCover = 0;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ state, revision: 1, speed: 1,
      savedAt: Date.now(), recovered: false, temporaryPause: false, catchingUp: false }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /继续上一次旅程/ }).click();
  const canvas = page.locator('.scene-canvas');
  await expect(page.getByRole('img', { name: `当前时段：${label}` })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-house-model-state', 'ready', { timeout: 60000 });
  await expect(canvas).toHaveAttribute('data-day-period', period);
  const sun = Number(await canvas.getAttribute('data-sun-intensity'));
  if (period === 'noon') expect(sun).toBeGreaterThan(4); else expect(sun).toBeLessThan(.4);
  const weather = await page.getByRole('button', { name: '天气观察', exact: true }).boundingBox();
  const badge = await page.getByRole('img', { name: `当前时段：${label}` }).boundingBox();
  expect(badge!.x).toBeGreaterThan(weather!.x + weather!.width);
  await page.screenshot({ path: `docs/screenshots/${path}.png` });
});
