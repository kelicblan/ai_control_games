import { expect, test } from '@playwright/test';
import { createGame } from '../src/games/camp/simulation/engine';
import { SAVE_KEY } from '../src/games/camp/simulation/persistence';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}×${viewport.height} 新人格与持续拒绝`, () => {
    test.use({ viewport, serviceWorkers: 'block' });
    test('文字拒绝会累积立场，重新安排和读档不会清除', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      // 此流程明确验证无语言模型的完整行为，真实模型另由已有 WASM 用例验证。
      await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
      const state = createGame({ seed: 73 }); state.status = 'paused'; state.elapsed = 20; state.selectedNpc = 'linlan';
      state.npcs.find(npc => npc.id === 'linlan')!.energy = 32;
      await page.addInitScript(({ key, snapshot }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(snapshot));
      }, { key: SAVE_KEY, snapshot: { version: 1, savedAt: 1, state } });
      await page.goto('/');
      await expect(page).toHaveTitle(/今晚别挨饿/);
      await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20000 });
      await page.getByRole('button', { name: /^继续上一次旅程/ }).click();
      await expect(page.getByRole('button', { name: '选择林枫', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '营地选项', exact: true }).click();
      await expect(page.locator('.partner-personality')).toContainText('懒惰');
      await page.getByRole('button', { name: '主动聊聊', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '营地对话', exact: true });
      for (let index = 1; index <= 3; index++) {
        await dialog.getByLabel('想对伙伴说的话').fill('不许休息');
        await dialog.getByRole('button', { name: '发送', exact: true }).click();
        await expect(dialog.getByLabel('当前态度')).toContainText(`已被拒绝 ${index} 次`);
      }
      await expect(dialog.getByLabel('当前态度')).toContainText('拒绝安排');
      await expect(dialog.locator('.social-line.companion').last()).toContainText('爱谁干谁干');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('vite-error-overlay').count()).toBe(0);
      await page.screenshot({ path: testInfo.outputPath('npc-refusal.png') });
      await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click();
      await page.getByRole('button', { name: '收集木材', exact: true }).click();
      await expect.poll(() => page.evaluate(key => {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        return saved?.state.npcs.find((npc: { id: string }) => npc.id === 'linlan')?.mind.intent.kind;
      }, SAVE_KEY)).toBe('refuse');
      await page.reload();
      await page.getByRole('button', { name: /^继续上一次旅程/ }).click();
      await page.getByRole('button', { name: '营地选项', exact: true }).click();
      await expect(page.getByLabel('当前态度')).toContainText('拒绝安排');
      await expect(page.getByLabel('当前态度')).toContainText('已被拒绝');
      expect(errors).toEqual([]);
    });
  });
}
