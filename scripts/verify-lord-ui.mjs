// Browser skill bootstrap was attempted; native bridge is unavailable on this host.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5173/');
  const canvas = page.locator('canvas.scene-canvas');
  await page.waitForSelector('canvas[data-lord-model="ready"]', { timeout: 90000 });
  checks.push('GLB loaded in actual game');
  const start = page.getByRole('button', { name: '点亮篝火，出发吧', exact: true });
  if (await start.isVisible()) await start.click();
  const resume = page.getByRole('button', { name: '继续游戏', exact: true });
  if (await resume.isVisible()) await resume.click();
  await page.getByRole('button', { name: '♛ 领主视角', exact: true }).click();
  await page.waitForSelector('canvas[data-camera-mode="lord"]');
  const before = await canvas.getAttribute('data-lord-x');
  await page.bringToFront();
  await page.waitForTimeout(2000);
  if (await resume.isVisible()) await resume.click();
  await page.keyboard.down('d');
  try { await page.waitForSelector('canvas[data-lord-animation="Walk"]', { timeout: 15000 }); }
  finally { await page.keyboard.up('d'); }
  checks.push('WASD activates Walk');
  await page.waitForSelector('canvas[data-lord-animation="Idle"]', { timeout: 15000 });
  checks.push('Key release returns to Idle');
  const after = await canvas.getAttribute('data-lord-x');
  if (before === after) throw new Error('Lord did not move');
  await page.screenshot({ path: 'docs/screenshots/lord-game-replaced.png' });
  await page.getByRole('button', { name: '上帝视角', exact: true }).click();
  await page.waitForSelector('canvas[data-view-mode="god"]');
  checks.push('God view remains available');
  await page.goto('http://127.0.0.1:5173/scripts/lord-preview.html');
  await page.waitForSelector('canvas[data-model="ready"]', { timeout: 60000 });
  await page.screenshot({ path: 'docs/screenshots/lord-idle.png' });
  await page.click('#walk');
  await page.waitForSelector('canvas[data-animation="Walk"]');
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'docs/screenshots/lord-walk.png' });
  await page.click('#side');
  await page.screenshot({ path: 'docs/screenshots/lord-side.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ checks, errors, before, after }, null, 2));
} catch (error) { console.error(error); console.log((await page.locator('body').innerText()).slice(-2500)); console.log(await page.locator('canvas.scene-canvas').evaluateAll(cs=>cs.map(c=>({...c.dataset})))); await page.screenshot({path:'docs/screenshots/lord-ui-failure.png'}); process.exitCode = 1; }
finally { await writeFile('docs/lord-ui-verification.json', JSON.stringify({ checks, errors }, null, 2)); await browser.close(); }
