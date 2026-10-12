import { expectCameraControlReachable } from './hudGeometry';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    campAudioProbe: { activeLoops: number; totalLoops: number };
    campAudioResumeProbe: { waiting: boolean; finish: () => Promise<void> };
  }
}

test('failed audio activation stays visibly off and can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
      constructor() { throw new Error('Audio device unavailable'); }
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^点亮篝火，出发吧$/ }).click();
  await page.getByRole('button', { name: '开启音效', exact: true }).click();
  await expect(page.getByRole('button', { name: '开启音效', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '关闭音效', exact: true })).toHaveCount(0);
  await expect(page.getByText('暂未能播放声音，请再点一次开启。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开启音效', exact: true })).toBeEnabled();
});

test('audio activation still succeeds when the game pauses during device resume', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.campAudioProbe = { activeLoops: 0, totalLoops: 0 };
    window.campAudioResumeProbe = { waiting: false, finish: async () => {} };
    const NativeAudioContext = window.AudioContext;
    // Keep the real audio device, buffers, nodes and suspend/resume methods. Only
    // hold the completion boundary so a pause can occur while the UI awaits it.
    window.AudioContext = class extends NativeAudioContext {
      private held = true;
      private initiallySuspended: Promise<void>;
      constructor() {
        super();
        this.initiallySuspended = super.suspend();
        Object.defineProperty(this, 'state', { get: () => this.held
          ? 'suspended' : Reflect.get(NativeAudioContext.prototype, 'state', this) });
      }
      resume() {
        window.campAudioResumeProbe.waiting = true;
        return new Promise<void>(resolve => {
          window.campAudioResumeProbe.finish = async () => {
            await this.initiallySuspended;
            await super.resume();
            this.held = false;
            resolve();
          };
        });
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        let active = false;
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
          start(...args);
          if (source.loop) { active = true; window.campAudioProbe.activeLoops++; window.campAudioProbe.totalLoops++; }
        };
        source.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => {
          stop(...args);
          if (active) { active = false; window.campAudioProbe.activeLoops--; }
        };
        return source;
      }
    };
  });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.goto('/');
  await expect(page).toHaveTitle('今晚别挨饿 · CampMind');
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20_000 });
  await page.clock.pauseAt(new Date('2026-10-12T13:00:00Z'));
  await page.getByRole('button', { name: /^点亮篝火，出发吧$/ }).click();
  await page.clock.runFor(100);
  await page.getByRole('button', { name: '开启音效', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.campAudioResumeProbe.waiting)).toBe(true);
  await expect(page.getByRole('button', { name: '开启音效', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await page.clock.runFor(100);
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(0);
  await page.evaluate(() => window.campAudioResumeProbe.finish());
  await expect(page.getByRole('button', { name: '关闭音效', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(0);
  await expect(page.getByText('暂未能播放声音，请再点一次开启。', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBeLessThanOrEqual(5);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile wind and environmental audio follow play, pause and mute without accumulating sources', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.campAudioProbe = { activeLoops: 0, totalLoops: 0 };
    const NativeAudioContext = window.AudioContext;
    // Observe real platform sources, without replacing synthesis or the device.
    window.AudioContext = class extends NativeAudioContext {
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        let active = false;
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
          start(...args);
          if (source.loop) { active = true; window.campAudioProbe.activeLoops++; window.campAudioProbe.totalLoops++; }
        };
        source.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => {
          stop(...args);
          if (active) { active = false; window.campAudioProbe.activeLoops--; }
        };
        return source;
      }
    };
  });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.goto('/');
  await expect(page).toHaveTitle('今晚别挨饿 · CampMind');
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20_000 });
  await page.clock.pauseAt(new Date('2026-10-12T13:00:00Z'));
  await page.getByRole('button', { name: /^点亮篝火，出发吧$/ }).click();
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.campAudioProbe.totalLoops)).toBe(0);
  await page.getByRole('button', { name: '天气观察', exact: true }).click();
  const weather = page.getByRole('dialog', { name: '风雨中的营地', exact: true });
  await expect(weather).toBeVisible();
  // Check the untouched first viewport. No weather button is scrolled into view.
  for (const label of ['吹起山风', '落下一场雨', '唤来雷暴', '让天空放晴']) {
    const bounds = await weather.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(bounds, `${label} must have a visible rectangle`).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);
    expect(bounds!.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
    expect(bounds!.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width, `${label} right edge`).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height, `${label} bottom edge`).toBeLessThanOrEqual(844);
  }
  await expect(weather.getByRole('region', { name: '风向', exact: true })).toContainText('风吹向');
  await weather.getByRole('button', { name: '开启环境音', exact: true }).click();
  await expect(weather.getByRole('button', { name: '关闭环境音', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(0);
  await weather.getByRole('button', { name: '唤来雷暴', exact: true }).click();
  await page.clock.runFor(3500);
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(5);
  await expect(page.locator('.weather-pill')).toContainText('吹向');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.runFor(200);
  const before = Number(await page.locator('canvas').getAttribute('data-visual-time'));
  await page.clock.runFor(200);
  expect(Number(await page.locator('canvas').getAttribute('data-visual-time'))).toBeGreaterThan(before);
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await page.clock.runFor(100);
  const frozen = await page.locator('canvas').getAttribute('data-visual-time');
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(0);
  await expectCameraControlReachable(page);
  await page.getByRole('button', { name: '调整营地视角', exact: true }).click();
  await page.getByRole('button', { name: '缩小营地', exact: true }).click();
  await page.clock.runFor(350);
  expect(await page.locator('canvas').getAttribute('data-visual-time')).toBe(frozen);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(5);
  await page.getByRole('button', { name: '关闭音效', exact: true }).click();
  expect(await page.evaluate(() => window.campAudioProbe.activeLoops)).toBe(0);
  await expect(page.getByRole('button', { name: '开启音效', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await testInfo.attach('mobile-physical-weather', { body: await page.screenshot(), contentType: 'image/png' });
});
