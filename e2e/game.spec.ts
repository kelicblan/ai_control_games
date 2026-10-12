import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PolicyMetadata } from '../src/ai/policy';
import type { GameOptions, GameState } from '../src/game/types';

type DecisionExport = Pick<GameState,
  'seed' | 'mode' | 'difficulty' | 'scenario' | 'elapsed' | 'stats' | 'npcs' | 'decisions' | 'events'
> & {
  exportedAt: string;
  model: PolicyMetadata | null;
  featureNames: string[];
  actionOrder: string[];
  note: string;
};

interface CacheStatus {
  type: 'CACHE_STATUS';
  version: string;
  files: number;
  expectedFiles: number;
  complete: boolean;
}

const startButtonName = /^(点亮篝火，出发吧|重新开始一段旅程|出发，开始新的一局)$/;
const difficultyNames = { cozy: /^悠然露营/, normal: /^荒野求生/, hard: /^凛夜挑战/ };

async function visitWelcome(page: Page, { clock = true, waitForModel = true } = {}) {
  // Install before application timers exist; freeze only after the page has loaded.
  // runFor fires every timer. fastForward would skip most of the simulation ticks.
  if (clock) await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: '今晚，我们一起留下来。', exact: true });
  await expect(dialog).toBeVisible();
  if (waitForModel) await expect(dialog.getByRole('button', { name: startButtonName })).toBeEnabled({ timeout: 20_000 });
  if (clock) await page.clock.pauseAt(new Date('2026-10-12T13:00:00Z'));
  return dialog;
}

async function startJourney(page: Page, options: GameOptions = {}) {
  const { seed = 17, mode = 'model', difficulty = 'cozy', scenario = 'standard' } = options;
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: difficultyNames[difficulty] }).click();
  const settings = dialog.locator('.experiment-toggle');
  if (await settings.getAttribute('aria-expanded') === 'false') await settings.click();
  await dialog.getByLabel('NPC 决策方式').selectOption(mode);
  await dialog.getByLabel('初始场景').selectOption(scenario);
  await dialog.getByLabel('世界种子').fill(String(seed));
  await dialog.getByRole('button', { name: startButtonName }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeEnabled();
}

async function openDecisions(page: Page) {
  await page.getByRole('button', { name: '决策观察', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '决策观察', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function downloadDecisions(page: Page): Promise<DecisionExport> {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('dialog', { name: '决策观察', exact: true })
    .getByRole('button', { name: '导出真实记录', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^campmind-\d+-(model|rules)\.json$/);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The decision export did not produce a readable download.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as DecisionExport;
}

function expectRealModelDecisions(data: DecisionExport) {
  expect(data.mode).toBe('model');
  expect(data.model?.kind).toBe('supervised-mlp');
  expect(data.model?.parameterCount).toBeGreaterThan(0);
  expect(data.model?.weightBytes).toBeGreaterThan(0);
  expect(data.featureNames).toHaveLength(36);
  expect(data.actionOrder).toHaveLength(8);
  expect(data.stats.modelDecisions).toBeGreaterThan(0);
  expect(data.stats.ruleDecisions).toBe(0);
  expect(data.stats.fallbackDecisions).toBe(0);
  expect(data.decisions.length).toBeGreaterThan(0);
  for (const record of data.decisions) {
    expect(record.source).toBe('model');
    expect(record.features).toHaveLength(36);
    expect(record.features.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(record.allowed).toContain(record.action);
    expect(record.scores).toHaveLength(8);
    expect(record.scores.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(record.scores.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
  }
  // The controlled clock is for game logic, not a latency benchmark.
  expect(data.note).toContain('softmax');
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
}

async function readCacheStatus(page: Page): Promise<CacheStatus> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('No active production service worker.');
    return new Promise<CacheStatus>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        channel.port1.close();
        reject(new Error('The service worker did not answer CACHE_STATUS.'));
      }, 5000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data as CacheStatus);
      };
      registration.active!.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
    });
  });
}

test('model decisions survive paused commands, food is spent, and Space activates the focused sound button', async ({ page }) => {
  await visitWelcome(page);
  const startingPositions = await page.locator('.map-npc').evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).style.cssText));
  await startJourney(page);
  await page.clock.runFor(2000);
  const workingPositions = await page.locator('.map-npc').evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).style.cssText));
  expect(workingPositions).not.toEqual(startingPositions);

  await page.getByRole('button', { name: '选择小米', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择小米', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  const dock = page.locator('.command-dock');
  const pausedCountdown = await page.locator('.mission-countdown').textContent();
  await dock.getByRole('button', { name: /收集木材/ }).click();
  await expect(dock.locator('.command-status')).toHaveText('安排：收集木材');
  await page.clock.runFor(5000);
  await expect(page.locator('.mission-countdown')).toHaveText(pausedCountdown!);
  await expect(dock.locator('.command-status')).toHaveText('安排：收集木材');

  await page.getByRole('button', { name: '开启音效', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '关闭音效', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '开启音效', exact: true })).toBeVisible();

  // Feed a different NPC so the just-issued task's interaction cooldown is respected.
  await page.getByRole('button', { name: '选择阿壮', exact: true }).click();
  const foodBefore = Number(await page.getByTestId('food-count').textContent());
  const hunger = page.getByRole('button', { name: '选择阿壮', exact: true }).getByRole('meter', { name: '饥饿', exact: true });
  const hungerBefore = Number(await hunger.getAttribute('aria-valuenow'));
  await dock.getByRole('button', { name: /分配食物/ }).click();
  await expect(page.getByTestId('food-count')).toHaveText(String(foodBefore - 1));
  expect(Number(await hunger.getAttribute('aria-valuenow'))).toBeLessThan(hungerBefore);

  await page.getByRole('button', { name: '选择小米', exact: true }).click();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.clock.runFor(1000);
  const panel = await openDecisions(page);
  await expect(panel.locator('.decision-source')).toContainText('真实模型输出');
  await expect(panel.getByText('归一化权重，非成功概率', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: /查看 36 维真实输入/ }).click();
  await expect(panel.locator('.feature-grid > div')).toHaveCount(36);
  const exported = await downloadDecisions(page);
  expectRealModelDecisions(exported);
  const commandWood = exported.featureNames.indexOf('commandWood');
  expect(commandWood).toBeGreaterThanOrEqual(0);
  expect(exported.decisions.some(record => record.npcId === 'xiaomi' && record.features[commandWood] === 1)).toBe(true);

  // Both modal closing and cancelling a new journey restore the original running state.
  await panel.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '玩法指南', exact: true }).click();
  const modalCountdown = await page.locator('.mission-countdown').textContent();
  await page.clock.runFor(3000);
  await expect(page.locator('.mission-countdown')).toHaveText(modalCountdown!);
  await page.getByRole('dialog').getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新旅程', exact: true }).click();
  await page.getByRole('dialog', { name: '开启新的旅程', exact: true }).getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
  await expect(page.locator('.mission-countdown')).toHaveText(modalCountdown!);
});

test.describe('390 × 844 touch layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('welcome, gameplay and inspector fit the viewport, and the selected portrait keeps its dimensions', async ({ page }) => {
    await visitWelcome(page);
    await expectNoHorizontalOverflow(page);
    await startJourney(page);
    await page.clock.runFor(1000);
    await expectNoHorizontalOverflow(page);
    const portrait = page.locator('.selected-companion > .portrait');
    await portrait.scrollIntoViewIfNeeded();
    const geometry = await portrait.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { width: bounds.width, height: bounds.height, grow: style.flexGrow, shrink: style.flexShrink };
    });
    expect(geometry.width).toBeCloseTo(36, 1);
    expect(geometry.height).toBeCloseTo(43, 1);
    expect(geometry.grow).toBe('0');
    expect(geometry.shrink).toBe('0');
    await page.getByRole('button', { name: '选择老周', exact: true }).tap();
    await expect(page.locator('.selected-companion > .portrait')).toHaveClass(/portrait-laozhou/);
    await expectNoHorizontalOverflow(page);
    await openDecisions(page);
    await expectNoHorizontalOverflow(page);
  });
});

test('production cache serves an offline reload, saved journey and new local model decisions', async ({ page, context }) => {
  // Use real timers here: cache acknowledgement and autosave must finish before disconnecting.
  await visitWelcome(page, { clock: false });
  await startJourney(page);
  await expect(page.locator('.command-status')).toContainText('当前：');
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  const panel = await openDecisions(page);
  const before = await downloadDecisions(page);
  expectRealModelDecisions(before);
  await panel.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByText('进度已保存', { exact: true })).toBeVisible();
  await expect(page.getByText('离线资源已备妥', { exact: true })).toBeVisible({ timeout: 30_000 });
  const cache = await readCacheStatus(page);
  expect(cache.type).toBe('CACHE_STATUS');
  expect(cache.complete).toBe(true);
  expect(cache.expectedFiles).toBeGreaterThan(0);
  expect(cache.files).toBe(cache.expectedFiles);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const welcome = page.getByRole('dialog', { name: '今晚，我们一起留下来。', exact: true });
  const continueButton = welcome.getByRole('button', { name: /^继续上一次旅程/ });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();
  await page.getByRole('button', { name: '选择小米', exact: true }).click();
  await page.locator('.command-dock').getByRole('button', { name: /收集木材/ }).click();
  await expect(page.locator('.command-status')).toContainText('当前：');
  await openDecisions(page);
  const after = await downloadDecisions(page);
  expectRealModelDecisions(after);
  expect(after.seed).toBe(before.seed);
  expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
  expect(after.stats.modelDecisions).toBeGreaterThan(before.stats.modelDecisions);
  const lastBeforeId = Math.max(...before.decisions.map(record => record.id));
  expect(after.decisions.some(record => record.id > lastBeforeId && record.source === 'model')).toBe(true);
});

test('a cozy model journey reaches a real victory and restarts with fresh records', async ({ page }) => {
  await visitWelcome(page);
  await startJourney(page, { seed: 17, difficulty: 'cozy', scenario: 'standard' });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await page.clock.runFor(52_500);
  await expect(page.getByText('天快亮了，召回所有伙伴！', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '全队回营', exact: true }).click();
  await page.clock.runFor(10_000);
  const outcome = page.getByRole('dialog', { name: '天亮了，我们都在。', exact: true });
  await expect(outcome).toBeVisible();
  await expect(outcome.locator('.outcome-crew > div')).toHaveCount(3);
  await expect(outcome.locator('.outcome-crew .fallen')).toHaveCount(0);
  await outcome.getByRole('button', { name: '查看这次的决策记录', exact: true }).click();
  const finished = await downloadDecisions(page);
  expectRealModelDecisions(finished);
  expect(finished.elapsed).toBe(240);
  expect(finished.npcs.every(npc => npc.alive && npc.health > 0)).toBe(true);
  expect(finished.decisions.length).toBeLessThanOrEqual(180);
  expect(finished.events.length).toBeLessThanOrEqual(80);
  await page.getByRole('dialog').getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.getByRole('button', { name: '查看旅程结算', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '同一种子再试一次', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '1×', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(1000);
  await openDecisions(page);
  const restarted = await downloadDecisions(page);
  expectRealModelDecisions(restarted);
  expect(restarted.seed).toBe(finished.seed);
  expect(restarted.elapsed).toBeLessThan(3);
  expect(restarted.decisions[0].id).toBe(1);
  expect(restarted.stats.modelDecisions).toBeLessThan(finished.stats.modelDecisions);
});

test('an unattended hard storm with seed 7 reaches a genuine failure', async ({ page }) => {
  await visitWelcome(page);
  await startJourney(page, { seed: 7, difficulty: 'hard', scenario: 'storm' });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await page.clock.runFor(61_000);
  const outcome = page.getByRole('dialog', { name: '这一晚，留下了遗憾。', exact: true });
  await expect(outcome).toBeVisible();
  await expect(outcome.locator('.outcome-story')).toContainText(/篝火熄灭|没能撑过|还没回到/);
  await outcome.getByRole('button', { name: '查看这次的决策记录', exact: true }).click();
  const failed = await downloadDecisions(page);
  expectRealModelDecisions(failed);
  expect(failed.seed).toBe(7);
  expect(failed.difficulty).toBe('hard');
  expect(failed.scenario).toBe('storm');
  expect(failed.elapsed).toBeGreaterThan(0);
  expect(failed.elapsed).toBeLessThanOrEqual(240);
});

test.describe('model download failure', () => {
  // A service worker must not bypass this deliberately failed network request.
  test.use({ serviceWorkers: 'block' });

  test('shows the failure and starts a clearly labelled rules run only after the user chooses it', async ({ page }) => {
    await page.route('**/models/manifest.json', route => route.fulfill({
      status: 503, contentType: 'application/json', body: '{}',
    }));
    const welcome = await visitWelcome(page, { waitForModel: false });
    await expect(welcome.getByRole('alert')).toContainText('模型加载失败');
    await expect(welcome.getByRole('button', { name: startButtonName })).toBeDisabled();
    await expect(welcome.getByRole('button', { name: '重新加载', exact: true })).toBeEnabled();
    await welcome.getByRole('button', { name: '使用规则模式体验', exact: true }).click();
    await startJourney(page, { mode: 'rules' });
    await page.clock.runFor(1000);
    const panel = await openDecisions(page);
    await expect(panel.locator('.decision-source')).toContainText('规则输出');
    await expect(panel.getByText('规则策略对照', { exact: true })).toBeVisible();
    const data = await downloadDecisions(page);
    expect(data.mode).toBe('rules');
    expect(data.model).toBeNull();
    expect(data.stats.ruleDecisions).toBeGreaterThan(0);
    expect(data.stats.modelDecisions).toBe(0);
    expect(data.stats.fallbackDecisions).toBe(0);
    expect(data.decisions.every(record => record.source === 'rules' && record.features.length === 36)).toBe(true);
  });
});
