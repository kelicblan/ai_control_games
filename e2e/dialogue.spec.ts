import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20000 });
  await page.getByRole('button', { name: '点亮篝火，出发吧', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('slow speech leaves immediate feedback and running decisions available', async ({ page }) => {
  await page.route('**/npc-api/health', route => route.fulfill({ json: { ready: true, model: 'minimind-3-q8' } }));
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/npc-api/speech', async route => {
    const body = route.request().postDataJSON(); started();
    await blocked;
    await route.fulfill({ json: { requestId: body.requestId, text: '我先把这件事做好。', source: 'minimind3', latencyMs: 1600 } }).catch(() => {});
  });
  await start(page);
  await requested;
  await expect(page.locator('.npc-speech[data-speech-source="template"]')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const saved = localStorage.getItem('campmind-save-v1');
    return saved ? JSON.parse(saved).state.elapsed : 0;
  }), { timeout: 10000 }).toBeGreaterThan(1);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('campmind-save-v1')!).state);
  expect(state.stats.modelDecisions).toBeGreaterThan(0);
  expect(state.npcs.some((npc: { action: string | null }) => npc.action !== null)).toBe(true);
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  release();
  await expect(page.locator('.npc-speech[data-speech-source="minimind3"]')).toHaveCount(0);
});

test('unavailable service has a visible fallback and an independent switch', async ({ page }) => {
  await page.route('**/npc-api/**', route => route.fulfill({ status: 503, json: { error: 'offline' } }));
  await start(page);
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  const section = page.getByRole('region', { name: '伙伴台词', exact: true });
  await expect(section).toContainText('暂用即时预设台词');
  await section.getByRole('button', { name: 'MiniMind3 开', exact: true }).click();
  await expect(section.getByRole('button', { name: 'MiniMind3 关', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(section).toContainText('使用即时预设台词');
});

test('real local MiniMind generation reaches a selected NPC bubble through the proxy', async ({ page }) => {
  test.skip(process.env.NPC_REAL_TEST !== '1', 'Requires the Windows model service, excluded from portable CI');
  const replies: { source: string; text: string; latencyMs: number }[] = [];
  page.on('response', async response => {
    if (response.url().endsWith('/npc-api/speech') && response.status() === 200) {
      replies.push(await response.json());
    }
  });
  await start(page);
  await expect(page.locator('.npc-speech[data-speech-source="minimind3"]')).toBeVisible({ timeout: 25000 });
  expect(replies.some(reply => reply.source === 'minimind3' && reply.latencyMs >= 0)).toBe(true);
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await expect(page.getByRole('region', { name: '伙伴台词', exact: true })).toContainText('本机模型已连接');
  await page.screenshot({ path: 'test-results/minimind-dialogue-desktop.png' });
});

test('optional service absence through the real proxy has no browser resource errors', async ({ page }) => {
  test.skip(process.env.NPC_OFFLINE_TEST !== '1', 'Requires the local model service to be stopped');
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await start(page);
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await expect(page.getByRole('region', { name: '伙伴台词', exact: true })).toContainText('暂用即时预设台词');
  expect(errors).toEqual([]);
});
