import { expect, test } from '@playwright/test';
import { createGame } from '../src/games/camp/simulation/engine';
import { SAVE_KEY } from '../src/games/camp/simulation/persistence';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}×${viewport.height} 角色初始设置`, () => {
    test.use({ viewport, serviceWorkers: 'block' });
    test('逐角色保存、刷新读取、旧档隔离与新开局应用', async ({ page }, testInfo) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
      const old = createGame({ mode: 'rules' }); old.status = 'paused'; old.elapsed = 10; old.npcs[0].energy = 17;
      await page.addInitScript(({ key, state }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: 1, state }));
      }, { key: SAVE_KEY, state: old });
      await page.goto('/');
      await page.getByRole('button', { name: /^角色初始设置/ }).click();
      const settings = page.getByRole('dialog', { name: '角色初始设置', exact: true });
      await expect(settings.getByLabel('初始体力', { exact: true })).toBeEnabled();
      await settings.getByLabel('初始体力', { exact: true }).fill('43');
      await settings.getByLabel('采木技能', { exact: true }).fill('91');
      await settings.getByRole('button', { name: /^老周/ }).click();
      await settings.getByLabel('诚实', { exact: true }).fill('96');
      await settings.getByRole('button', { name: '保存初始模板', exact: true }).click();
      await expect(settings.getByRole('status')).toContainText('已保存');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('npc-settings.png') });
      await page.reload();
      await page.getByRole('button', { name: /^角色初始设置/ }).click();
      await expect(settings.getByLabel('初始体力', { exact: true })).toHaveValue('43');
      await expect(settings.getByLabel('采木技能', { exact: true })).toHaveValue('91');
      await settings.getByRole('button', { name: /^老周/ }).click();
      await expect(settings.getByLabel('诚实', { exact: true })).toHaveValue('96');
      await settings.getByRole('button', { name: '返回', exact: true }).click();
      await page.getByRole('button', { name: /^继续上一次旅程/ }).click();
      await page.getByRole('button', { name: '营地选项', exact: true }).click();
      // 打开对话会暂停；保存当前真实状态以后，旧档不应突然出现新模板。
      await expect.poll(() => page.evaluate(key => {
        const state = JSON.parse(localStorage.getItem(key) || 'null')?.state;
        return state?.npcs[0]?.initialSettings ?? null;
      }, SAVE_KEY)).toBeNull();
      await page.getByRole('button', { name: '新旅程', exact: true }).click();
      await page.getByRole('button', { name: '出发，开始新的一局', exact: true }).click();
      await page.getByRole('button', { name: '营地选项', exact: true }).click();
      await expect.poll(() => page.evaluate(key => {
        const state = JSON.parse(localStorage.getItem(key) || 'null')?.state;
        return state?.npcs[0]?.initialSettings?.values['body.energy'];
      }, SAVE_KEY)).toBe(43);
      await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.state.npcs
        .find((npc: { id: string }) => npc.id === 'laozhou')?.initialSettings?.values['trait.honesty'], SAVE_KEY)).toBe(.96);
      expect(errors).toEqual([]);
    });
  });
}

test('空值阻止保存，取消不写入，错误导入不覆盖草稿', async ({ page }) => {
  await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
  await page.goto('/'); await page.getByRole('button', { name: /^角色初始设置/ }).click();
  const dialog = page.getByRole('dialog', { name: '角色初始设置', exact: true });
  const energy = dialog.getByLabel('初始体力', { exact: true }); await expect(energy).toBeEnabled();
  await energy.fill(''); await expect(energy).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('button', { name: '保存初始模板', exact: true })).toBeDisabled();
  await energy.fill('42');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(dialog.getByRole('alert')).toContainText('JSON'); await expect(energy).toHaveValue('42');
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: /^角色初始设置/ }).click(); await expect(energy).toHaveValue('88');
});

test('离开开局页去设置再回来，不丢失种子、模式和难度草稿', async ({ page }) => {
  await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
  await page.goto('/');
  await page.getByRole('button', { name: /凛夜挑战/ }).click();
  await page.getByRole('button', { name: '模型与场景设置', exact: false }).click();
  await page.getByLabel('NPC 决策方式').selectOption('rules');
  await page.getByLabel('初始场景').selectOption('conflict');
  await page.locator('.seed-field input').fill('7359');
  await page.getByRole('button', { name: /^角色初始设置/ }).click();
  const settings = page.getByRole('dialog', { name: '角色初始设置', exact: true });
  await expect(settings.getByLabel('初始体力', { exact: true })).toBeEnabled();
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByLabel('NPC 决策方式')).toHaveValue('rules');
  await expect(page.getByLabel('初始场景')).toHaveValue('conflict');
  await expect(page.locator('.seed-field input')).toHaveValue('7359');
  await expect(page.getByRole('button', { name: /凛夜挑战/ })).toHaveAttribute('aria-pressed', 'true');
});

test('两个设置窗口同时编辑时检测冲突，不覆盖较新的角色模板', async ({ page, context }) => {
  await context.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
  const other = await context.newPage();
  for (const target of [page, other]) {
    await target.goto('/'); await target.getByRole('button', { name: /^角色初始设置/ }).click();
    await expect(target.getByLabel('初始体力', { exact: true })).toBeEnabled();
  }
  await page.getByLabel('初始体力', { exact: true }).fill('40');
  await page.getByRole('button', { name: '保存初始模板', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '角色初始设置', exact: true }).getByRole('status')).toContainText('已保存');
  await other.getByLabel('初始体力', { exact: true }).fill('41');
  await other.getByRole('button', { name: '保存初始模板', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('其他页面更新');
  await expect(other.getByLabel('初始体力', { exact: true })).toHaveValue('41');
  other.once('dialog', prompt => prompt.accept());
  await other.getByRole('button', { name: '重新载入配置', exact: true }).click();
  await expect(other.getByLabel('初始体力', { exact: true })).toHaveValue('40');
});
