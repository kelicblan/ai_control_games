import { expectCameraControlReachable } from './hudGeometry';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PolicyMetadata } from '../src/ai/policy';
import type { GameOptions, GameState } from '../src/game/types';
import { OrthographicCamera, Vector3 } from 'three';
import { configureCamera, defaultOrbit, projectWorld } from '../src/scene/camera';

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
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20_000 });
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

async function openCamp(page: Page) {
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '营地与伙伴', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openDecisions(page: Page) {
  const camp = await openCamp(page);
  await camp.getByRole('button', { name: '决策观察', exact: true }).click();
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
  expect(data.featureNames).toHaveLength(41);
  expect(data.actionOrder).toHaveLength(8);
  expect(data.stats.modelDecisions).toBeGreaterThan(0);
  expect(data.stats.ruleDecisions).toBe(0);
  expect(data.stats.fallbackDecisions).toBe(0);
  expect(data.decisions.length).toBeGreaterThan(0);
  for (const record of data.decisions) {
    expect(record.source).toBe('model');
    expect(record.features).toHaveLength(41);
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

async function expectGameFitsViewport(page: Page) {
  await expectNoHorizontalOverflow(page);
  const sizes = await page.evaluate(() => ({
    viewport: window.innerHeight,
    document: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
  }));
  expect(sizes.document, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 1);
  expect(sizes.body, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 1);
  for (const name of ['收集木材', '寻找食物', '照看篝火', '休息', '帮助伙伴']) {
    const action = page.locator('.command-dock').getByRole('button', { name, exact: true });
    await expect(action).toBeInViewport();
    const bounds = await action.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  const canvas = page.locator('.camp-map canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(node => {
    const gl = (node as HTMLCanvasElement).getContext('webgl2');
    return Boolean(gl && !gl.isContextLost());
  })).toBe(true);
}

async function pointOnDefaultGround(page: Page, point: { x: number; y: number }) {
  const bounds = await page.locator('.camp-map canvas').boundingBox();
  if (!bounds) throw new Error('The live 3D canvas is missing.');
  const camera = new OrthographicCamera();
  configureCamera(camera, bounds.width, bounds.height, defaultOrbit());
  const projected = projectWorld(camera, new Vector3(point.x - 50, 0, point.y - 50), bounds.width, bounds.height);
  return { x: bounds.x + projected.x, y: bounds.y + projected.y };
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

test('model decisions survive paused commands, food is spent, and Space activates the focused sound button', async ({ page }, testInfo) => {
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
  const camp = await openCamp(page);
  await camp.getByRole('button', { name: /分配食物/ }).click();
  await camp.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByTestId('food-count')).toHaveText(String(foodBefore - 1));
  expect(Number(await hunger.getAttribute('aria-valuenow'))).toBeLessThan(hungerBefore);

  await page.getByRole('button', { name: '选择小米', exact: true }).click();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.clock.runFor(1000);
  const panel = await openDecisions(page);
  await expect(panel.locator('.decision-source')).toContainText('真实模型输出');
  await expect(panel.getByText('归一化权重，非成功概率', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: /查看 41 维真实输入/ }).click();
  await expect(panel.locator('.feature-grid > div')).toHaveCount(41);
  const exported = await downloadDecisions(page);
  expectRealModelDecisions(exported);
  await page.screenshot({ path: testInfo.outputPath('decisions.png') });
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
  await openCamp(page);
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
    await page.getByRole('button', { name: '暂停游戏', exact: true }).tap();
    await expectGameFitsViewport(page);
    const cameraMenu = page.getByRole('button', { name: '调整营地视角', exact: true });
    await expectCameraControlReachable(page);
    await cameraMenu.tap();
    await expect(cameraMenu).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: '放大营地', exact: true }).tap();
    await page.getByRole('button', { name: '缩小营地', exact: true }).tap();
    await page.getByRole('button', { name: '复位营地视角', exact: true }).tap();
    await page.clock.runFor(100);
    await cameraMenu.tap();
    const fireMarker = page.getByRole('button', { name: '让选中伙伴照看篝火', exact: true });
    const fireBounds = await fireMarker.boundingBox();
    if (!fireBounds) throw new Error('The projected fire marker is missing.');
    const statusBeforeDrag = await page.locator('.command-status').textContent();
    const markerX = fireBounds.x + fireBounds.width / 2, markerY = fireBounds.y + fireBounds.height / 2;
    await page.mouse.move(markerX, markerY);
    await page.mouse.down();
    await page.mouse.move(markerX + 12, markerY, { steps: 3 });
    await page.mouse.up();
    await page.clock.runFor(100);
    await expect(page.locator('.command-status')).toHaveText(statusBeforeDrag!);
    await fireMarker.tap();
    await expect(page.locator('.command-status')).toHaveText('安排：照看篝火');
    // This visible resume control must remain reachable above the selected-companion strip.
    await page.getByRole('button', { name: /旅程已暂停.*点击继续/ }).tap();
    await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
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

for (const viewport of [{ width: 360, height: 740 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width} × ${viewport.height} full-screen 3D layout`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('keeps tasks on screen and rotates the same world without issuing a movement command', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await visitWelcome(page);
      await startJourney(page);
      await page.clock.runFor(500);
      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      await expectGameFitsViewport(page);
      const labels = page.locator('.map-npc');
      const before = await labels.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.cssText));
      const canvas = await page.locator('.camp-map canvas').boundingBox();
      const x = canvas!.x + canvas!.width * .54;
      const y = canvas!.y + canvas!.height * .53;
      const status = await page.locator('.command-status').textContent();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 65, y + 12, { steps: 8 });
      await page.mouse.up();
      await page.clock.runFor(150);
      const after = await labels.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.cssText));
      expect(after).not.toEqual(before);
      await expect(page.locator('.command-status')).toHaveText(status!);
      await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeVisible();
      await expectGameFitsViewport(page);
      expect(errors).toEqual([]);
    });
  });
}

test('a real 3D ground click reaches the fire boundary, records a burn and lets the NPC recover', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await visitWelcome(page);
  await startJourney(page);
  await page.clock.runFor(100);
  await page.getByRole('button', { name: '选择阿壮', exact: true }).click();
  const fire = await pointOnDefaultGround(page, { x: 51, y: 54 });
  // The floating fire task label remains a safe assignment; directly tapping the 3D fire is movement.
  await page.mouse.click(fire.x, fire.y);
  await expect(page.locator('.command-status')).toContainText('正在移动');
  await page.clock.runFor(3000);
  await openDecisions(page);
  const data = await downloadDecisions(page);
  const event = data.events.find(item => item.npcId === 'azhuang' && item.reaction?.kind === 'burn');
  expect(event?.reaction?.objectId).toBe('campfire');
  expect(event?.reaction?.utterance).toContain('烫');
  const npc = data.npcs.find(item => item.id === 'azhuang')!;
  expect(npc.health).toBeLessThan(100);
  expect(npc.collision?.lastHit?.kind).toBe('burn');
  expect(npc.manualTarget).toBeUndefined();
  expect(Math.hypot(npc.position.x - 51, npc.position.y - 54)).toBeGreaterThanOrEqual(4.4);
  expectRealModelDecisions(data);
  expect(errors).toEqual([]);
});

test('losing the WebGL context pauses the journey and the visible retry restores the scene', async ({ page }) => {
  await visitWelcome(page);
  await startJourney(page);
  await page.clock.runFor(200);
  const map = page.locator('.camp-map');
  await expect(map).toHaveAttribute('data-scene-state', 'ready');
  await page.locator('.camp-map canvas').evaluate(node => {
    const extension = (node as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('The browser does not expose the WebGL context-loss test extension.');
    extension.loseContext();
  });
  await page.clock.runFor(100);
  await expect(map).toHaveAttribute('data-scene-state', 'error');
  await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeVisible();
  const countdown = await page.locator('.mission-countdown').textContent();
  await page.clock.runFor(2000);
  await expect(page.locator('.mission-countdown')).toHaveText(countdown!);
  await page.getByRole('button', { name: '重新绘制营地', exact: true }).click();
  await page.clock.runFor(150);
  await expect(map).toHaveAttribute('data-scene-state', 'ready');
  await expect(page.locator('.camp-map canvas')).toHaveCount(1);
  await expectGameFitsViewport(page);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.clock.runFor(1200);
  await expect(page.locator('.mission-countdown')).not.toHaveText(countdown!);
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
  const camp = await openCamp(page);
  await expect(page.getByText('进度已保存', { exact: true })).toBeVisible();
  await expect(page.getByText('离线资源已备妥', { exact: true })).toBeVisible({ timeout: 30_000 });
  const cache = await readCacheStatus(page);
  expect(cache.type).toBe('CACHE_STATUS');
  expect(cache.complete).toBe(true);
  expect(cache.expectedFiles).toBeGreaterThan(0);
  expect(cache.files).toBe(cache.expectedFiles);
  await camp.getByRole('button', { name: '关闭窗口', exact: true }).click();

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

test.describe('complete mobile journeys', () => {
  // Full rounds render every real state update. Software WebGL needs a larger budget
  // than short interactions; the primary phone viewport bounds the rendering cost.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a cozy model journey reaches a real victory and restarts with fresh records', async ({ page }) => {
    // This round also exports records, reopens the result, restarts and checks fresh inference.
    // Dense foliage increases software WebGL work; allow slower hosted runners
    // eight real minutes for the same game steps and outcome assertions.
    test.setTimeout(480_000);
    await visitWelcome(page);
    await startJourney(page, { seed: 17, difficulty: 'cozy', scenario: 'standard' });
    await page.getByRole('button', { name: '4×', exact: true }).click();
    await page.clock.runFor(52_500);
    await expect(page.getByText('天快亮了，召回所有伙伴！', { exact: true })).toBeVisible();
    const camp = await openCamp(page);
    await camp.getByRole('button', { name: /全队回营/ }).click();
    await expect(camp).toHaveCount(0);
    await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeVisible();
    await page.clock.runFor(10_000);
    const outcome = page.getByRole('dialog', { name: '天亮了，我们都在。', exact: true });
    await expect(outcome).toBeVisible();
    await expect(outcome.locator('.outcome-crew > div')).toHaveCount(5);
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
    test.setTimeout(240_000);
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
    expect(data.decisions.every(record => record.source === 'rules' && record.features.length === 41)).toBe(true);
  });
});

test('weather controls change the real world and export actual weather-triggered model decisions', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await visitWelcome(page);
  await startJourney(page, { seed: 17 });
  await page.clock.runFor(1500);
  await page.getByRole('button', { name: '选择小米', exact: true }).click();
  for (const [name, kind] of [['吹起山风', 'wind'], ['落下一场雨', 'rain'], ['唤来雷暴', 'storm']] as const) {
    await page.getByRole('button', { name: '天气观察', exact: true }).click();
    const weather = page.getByRole('dialog', { name: '风雨中的营地', exact: true });
    await expect(weather.getByRole('region', { name: '当前天气', exact: true })).toBeVisible();
    if (kind === 'wind') await testInfo.attach('mobile-weather-controls', { body: await page.screenshot(), contentType: 'image/png' });
    await weather.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.camp-map')).toHaveClass(new RegExp(`\\b${kind}\\b`));
    await page.clock.runFor(2500);
  }
  await expect(page.getByRole('button', { name: '天气观察', exact: true })).toContainText('雷雨交加');
  const panel = await openDecisions(page);
  await expect(panel.getByRole('region', { name: '决策时的天气输入', exact: true })).toBeVisible();
  const data = await downloadDecisions(page);
  expectRealModelDecisions(data);
  const weatherDecisions = data.decisions.filter(record => record.trigger === 'weather');
  expect(weatherDecisions.length).toBeGreaterThan(0);
  for (const kind of ['wind', 'rain', 'storm']) expect(weatherDecisions.some(record => record.weather?.kind === kind)).toBe(true);
  for (const record of weatherDecisions) {
    expect(record.source).toBe('model');
    expect(record.featureVersion).toBe(2);
    expect(record.features[14]).toBeCloseTo(record.weather!.rainIntensity, 6);
    expect(record.features[15]).toBeCloseTo(record.weather!.windStrength, 6);
    expect(record.features[36]).toBeCloseTo(record.weather!.stormRisk, 6);
    expect(record.features[37]).toBeCloseTo(record.weather!.wetness / 100, 6);
  }
  expect(errors).toEqual([]);
  await testInfo.attach('weather-decision-context', { body: await page.screenshot(), contentType: 'image/png' });
});
