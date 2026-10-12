import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page) {
  await page.route('**/npc-api/**', route => route.fulfill({ status: 503, json: { error: 'offline' } }));
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.goto('/');
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20000 });
  const welcome = page.getByRole('dialog');
  await welcome.getByRole('button', { name: /^悠然露营/ }).click();
  await page.clock.pauseAt(new Date('2026-10-12T13:00:00Z'));
  await welcome.getByRole('button', { name: '点亮篝火，出发吧', exact: true }).click();
}

test('five selectable people open a paused conversation and preserve an explicit arrangement', async ({ page }) => {
  await start(page);
  await expect(page.locator('.crew-portrait-button')).toHaveCount(5);
  await page.getByRole('button', { name: '选择林岚', exact: true }).click();
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await expect(page.locator('.partner-personality')).toContainText('公平');
  await page.getByRole('button', { name: '主动聊聊', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '营地对话', exact: true });
  await expect(dialog).toBeVisible();
  const pausedCountdown = await page.locator('.mission-countdown').textContent();
  await page.clock.runFor(250);
  await expect(page.locator('.mission-countdown')).toHaveText(pausedCountdown!);
  await expect(dialog.locator('.social-choice')).toHaveCount(3);
  await dialog.getByRole('button', { name: '聊聊分工', exact: true }).click();
  const first = dialog.locator('.social-choice:not([disabled])').first();
  await first.click();
  await expect(dialog.locator('.social-resolution')).toBeVisible();
  await expect(dialog.locator('.social-choice')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '聊聊分工', exact: true })).toBeDisabled();
  await expect(dialog.locator('.social-cooldown')).toBeVisible();
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await expect(page.locator('.partner-memories')).not.toContainText('还没有共同的经历');
});

test('a proactive request chip opens real choices and chat text never blocks them', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await page.clock.runFor(3500);
  const chip = page.getByRole('button', { name: /回应伙伴请求/ });
  await expect(chip).toBeVisible();
  await chip.click();
  const dialog = page.getByRole('dialog', { name: '营地对话', exact: true });
  await expect(dialog.locator('.social-choice')).toHaveCount(3);
  await dialog.getByLabel('想对伙伴说的话').fill('希望今晚每个人都能好好休息');
  await dialog.getByRole('button', { name: '发送', exact: true }).click();
  await expect(dialog.locator('.social-line.player').last()).toContainText('希望今晚每个人都能好好休息');
  await expect(dialog.locator('.social-choice:not([disabled])').first()).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await chip.click();
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeVisible();
});

for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}x${viewport.height} social controls`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });
    test('keeps all five people and compact tasks reachable with a scrollable conversation', async ({ page }) => {
      await start(page);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const name of ['阿壮', '小米', '老周', '林岚', '阿野']) {
        await page.getByRole('button', { name: `选择${name}`, exact: true }).tap();
        await expect(page.locator('.hud-selected-companion > strong')).toHaveText(name);
      }
      await expect(page.getByRole('button', { name: '收集木材', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '营地选项', exact: true }).tap();
      await page.getByRole('button', { name: '主动聊聊', exact: true }).tap();
      const dialog = page.getByRole('dialog', { name: '营地对话', exact: true });
      await expect(dialog.locator('.social-choice')).toHaveCount(3);
      await dialog.getByLabel('想对伙伴说的话').fill('我们先商量一下');
      await dialog.getByRole('button', { name: '发送', exact: true }).tap();
      await expect(dialog.locator('.social-line.player').last()).toContainText('我们先商量一下');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await dialog.getByRole('button', { name: '关闭窗口', exact: true }).tap();
      expect(errors).toEqual([]);
    });
  });
}
