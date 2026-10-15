// Browser plugin bootstrap failed (untrusted native pipe); use the project's existing Playwright.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const baseURL = process.env.MODEL_UI_URL ?? 'http://127.0.0.1:5173/';
const root = process.cwd(), out = path.join(root, 'gamesoul/logs/ui-verification', new URL(baseURL).hostname);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), evidence = { url: baseURL, stages: [], errors: [], checks: [], replies: [], selections: [], failedRequests: [] };
page.setDefaultTimeout(30000);
page.on('requestfailed', request => evidence.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('pageerror', error => evidence.errors.push(error.message));
page.on('response', response => { if (response.url().endsWith('/model-api/status')) void response.json().then(state => { evidence.stages.push(state); }).catch(() => {}); });
page.on('response', response => {
  if (response.url().endsWith('/model-api/generate')) void response.json().then(reply => evidence.replies.push(reply)).catch(() => {});
  if (response.url().endsWith('/model-api/select')) void response.json().then(reply => evidence.selections.push(reply)).catch(() => {});
});
try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByRole('button', { name: '游戏设置 · 对话模型', exact: true }).click();
  await page.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).waitFor();
  const mini = page.getByRole('button', { name: /MiniMind3 默认/ });
  if (await mini.getAttribute('aria-pressed') !== 'true') throw new Error('MiniMind is not the default');
  evidence.checks.push('MiniMind default');
  await page.screenshot({ path: path.join(out, 'settings-default.png') });
  await page.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).click();
  await page.locator('[data-model-stage="ready"], [data-model-stage="error"]').waitFor({ timeout: 60000 });
  evidence.nativeState = await page.locator('[data-model-stage]').innerText();
  await page.screenshot({ path: path.join(out, 'settings-native.png') });
  const ready = await page.locator('[data-model-stage="ready"]').count();
  if (!ready) throw new Error(`Native load failed: ${evidence.nativeState}`);
  evidence.checks.push('Native real load ready');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '游戏设置 · 对话模型', exact: true }).click();
  await page.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).waitFor();
  if (await page.getByRole('button', { name: /Qwen3.5 · 0.8B/ }).getAttribute('aria-pressed') !== 'true') throw new Error('Selection not persisted');
  evidence.checks.push('Selection restored after reload');
  await page.locator('[data-model-stage="ready"]').waitFor({ timeout: 60000 });
  if (!evidence.selections.at(-1)?.reused) throw new Error('Resident model not reused after reload');
  evidence.checks.push('Resident model reused after reload');
  await page.getByRole('button', { name: '返回游戏', exact: true }).click();
  await page.getByRole('button', { name: /点亮篝火，出发吧/ }).click();
  await page.getByRole('button', { name: '营地选项', exact: true }).click();
  await page.getByRole('button', { name: '主动聊聊', exact: true }).click();
  await page.locator('[data-dialogue-source^="native:"]').first().waitFor({ timeout: 60000 });
  evidence.dialogue = await page.locator('.social-dialog').innerText();
  evidence.checks.push('Actual native NPC reply in game');
  await page.screenshot({ path: path.join(out, 'native-dialogue.png') });
  console.log(JSON.stringify({ checks: evidence.checks, errors: evidence.errors, dialogue: evidence.dialogue, selections: evidence.selections }, null, 2));
} catch (error) { evidence.failure = error.message; console.log(JSON.stringify(evidence, null, 2)); process.exitCode = 1; }
finally { await writeFile(path.join(out, 'result.json'), JSON.stringify(evidence, null, 2), 'utf8'); await context.close(); await browser.close(); }
