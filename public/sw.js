/* Production template. scripts/generate-sw.mjs injects the exact build contents. */
const BUILD_VERSION = '__CAMPMIND_BUILD_VERSION__';
const PRECACHE_FILES = /* __CAMPMIND_PRECACHE_FILES__ */ [];
const BASE_URL = new URL('./', self.registration.scope);
const CACHE_PREFIX = `campmind-${encodeURIComponent(BASE_URL.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const INDEX_URL = new URL('./index.html', BASE_URL).href;
const PRECACHE_URLS = PRECACHE_FILES.map(path => new URL(path, BASE_URL).href);
const PRECACHE_SET = new Set(PRECACHE_URLS);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (!PRECACHE_URLS.length) throw new Error('CampMind offline cache requires a production build.');
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(PRECACHE_URLS.map(url => new Request(url, {
        cache: 'reload', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
      })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function serveCached(request, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const response = await fetch(request);
  // Refill only entries in this build's fixed manifest. Never grow an open-ended cache.
  if (response.ok && response.url && new URL(response.url).origin === BASE_URL.origin
    && response.type !== 'opaque' && PRECACHE_SET.has(cacheKey)) {
    try { await cache.put(cacheKey, response.clone()); } catch { /* Online response still works if storage is full. */ }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(serveCached(request, INDEX_URL));
    return;
  }
  url.search = '';
  url.hash = '';
  if (PRECACHE_SET.has(url.href)) event.respondWith(serveCached(request, url.href));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data?.type === 'CACHE_STATUS' && event.ports[0]) {
    const port = event.ports[0];
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const stored = new Set((await cache.keys()).map(request => request.url));
        port.postMessage({
          type: 'CACHE_STATUS', version: BUILD_VERSION, files: stored.size,
          expectedFiles: PRECACHE_FILES.length,
          complete: PRECACHE_URLS.length > 0 && PRECACHE_URLS.every(url => stored.has(url)),
        });
      } catch {
        port.postMessage({ type: 'CACHE_STATUS', version: BUILD_VERSION, files: 0,
          expectedFiles: PRECACHE_FILES.length, complete: false });
      }
    })());
  }
});
