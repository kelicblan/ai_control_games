// Browser plugin bootstrap previously failed: native bridge is unavailable.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], responses = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/models/subjects/')) responses.push({ url: response.url(), status: response.status() }); });
try {
  for (const batch of [1, 2, 3]) {
    await page.goto(`http://127.0.0.1:5173/scripts/subjects-preview.html?batch=${batch}`);
    await page.waitForSelector('canvas[data-model="ready"]', { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/subjects-batch-${batch}-idle.png` });
    for (const action of ['Walk', 'Work', 'Gather', 'Carry', 'WalkCarry', 'Rest']) {
      await page.locator(`[data-action="${action}"]`).click();
      await page.waitForSelector(`canvas[data-animation="${[action, action, action].join(',')}"]`, { timeout: 15000 });
      await page.waitForTimeout(350);
      if (action === 'Carry' || action === 'Work') await page.screenshot({ path: `docs/screenshots/subjects-batch-${batch}-${action.toLowerCase()}.png` });
      checks.push(`batch ${batch}: ${action}`);
    }
  }
  await page.goto('http://127.0.0.1:5173/');
  const status = 'azhuang:ready,xiaomi:ready,laozhou:ready,linlan:ready,aye:ready,tiesheng:ready,aling:ready,xiaoman:ready,shenyan:ready';
  await page.waitForSelector(`canvas[data-subject-models="${status}"]`, { timeout: 90000 });
  checks.push('all nine commoners loaded in actual game');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  await writeFile('docs/commoner-ui-verification.json', JSON.stringify({ checks, errors, responses }, null, 2));
  await browser.close();
}
