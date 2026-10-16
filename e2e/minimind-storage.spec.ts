import { expect, test, type Page } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { MINIMIND_ASSET } from '../src/integrations/minimind/assets';

test.use({ serviceWorkers: 'block' });

async function prepareWithoutOPFS(page: Page, denyAllStorage = false, throwingCache = false) {
  const file = (await readdir('dist/assets')).find(name => /^worker-.*\.js$/.test(name));
  expect(file).toBeTruthy();
  return page.evaluate(async ({ asset, denyAllStorage, throwingCache }) => {
    // Execute restrictions in the actual Worker realm before the bundled SDK imports.
    const source = `
      Object.defineProperty(navigator, 'storage', { value: {}, configurable: true });
      Object.defineProperty(globalThis, 'caches', ${throwingCache
        ? "{ get() { throw new DOMException('Denied', 'SecurityError'); }, configurable: true }"
        : '{ value: undefined, configurable: true }'});
      ${denyAllStorage ? "Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });" : ''}
      await import(${JSON.stringify(new URL(asset, location.origin).href)});
      postMessage({ type: 'probe-ready' });
    `;
    const bootstrap = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(bootstrap, { type: 'module' });
    const progress: { stage: string; cached?: boolean; persistent?: boolean }[] = [];
    try {
      return await new Promise<{ ready: typeof progress[number]; reply: { type: string; outcome?: string } }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Restricted-storage Worker timed out')), 120000);
        const fail = (message: string) => { clearTimeout(timer); reject(new Error(message)); };
        worker.onerror = event => fail(event.message);
        worker.onmessage = ({ data }) => {
          if (data.type === 'probe-ready') worker.postMessage({ id: 1, type: 'prepare', base: `${location.origin}/` });
          else if (data.type === 'progress') progress.push(data.value);
          else if (data.id === 1 && data.type === 'error') fail(data.error);
          else if (data.id === 1 && data.type === 'result') {
            worker.postMessage({ id: 2, type: 'generate', payload: { requestId: 'storage-probe',
              prompt: '<|im_start|>system\n你是营地伙伴，用一句简短中文回应。<|im_end|>\n<|im_start|>user\n你好。<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n' } });
          } else if (data.id === 2) {
            clearTimeout(timer);
            const ready = progress.find(value => value.stage === 'ready');
            if (!ready) reject(new Error('No ready progress')); else resolve({ ready, reply: data });
          }
        };
      });
    } finally { worker.terminate(); URL.revokeObjectURL(bootstrap); }
  }, { asset: `/assets/${file}`, denyAllStorage, throwingCache });
}

test.beforeEach(async ({ page }) => {
  test.skip(process.env.NPC_REAL_TEST !== '1', 'Requires staged MiniMind GGUF');
  await page.route('**/__minimind_storage_probe__', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><title>MiniMind restricted storage probe</title>' }));
  await page.goto('/__minimind_storage_probe__');
});

test('actual Worker persists verified weights in IndexedDB without OPFS or CacheStorage and reuses after refresh', async ({ page }) => {
  test.setTimeout(300000);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('minimind-verified-models', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('weights');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('weights', 'readwrite');
      tx.objectStore('weights').put(new Blob(['obsolete']), 'old-version:/old.gguf');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  let downloads = 0;
  page.on('request', request => { if (request.url().endsWith(MINIMIND_ASSET.file)) downloads++; });
  const initial = await prepareWithoutOPFS(page);
  expect(initial.ready).toMatchObject({ cached: false, persistent: true });
  expect(initial.reply.type === 'result' || initial.reply.outcome === 'skipped').toBe(true);
  expect(downloads).toBe(1);
  const sizes = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const request = indexedDB.open('minimind-verified-models', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('weights', 'readonly');
      const values = tx.objectStore('weights').getAll();
      tx.oncomplete = () => { db.close(); resolve(values.result.map((blob: Blob) => blob.size)); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  expect(sizes).toEqual([MINIMIND_ASSET.bytes]);
  await page.reload();
  await page.route('**/minimind/model.json', route => route.abort());
  await page.route(`**/${MINIMIND_ASSET.file}`, route => route.abort());
  const reloaded = await prepareWithoutOPFS(page, false, true);
  expect(reloaded.ready).toMatchObject({ cached: true, persistent: true });
  expect(reloaded.reply.type === 'result' || reloaded.reply.outcome === 'skipped').toBe(true);
  expect(downloads).toBe(1);
});

test('actual Worker still loads and infers when every persistent storage API is denied', async ({ page }) => {
  test.setTimeout(180000);
  const result = await prepareWithoutOPFS(page, true);
  expect(result.ready).toMatchObject({ cached: false, persistent: false });
  expect(result.reply.type === 'result' || result.reply.outcome === 'skipped').toBe(true);
});
