import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wllama } from '@wllama/wllama/esm/index.js';
import { browserModelStore, loadVerifiedModel } from '../src/integrations/minimind/assets';
import { createRuntimeCache, MemoryStorageBackend } from '../src/integrations/minimind/runtime-cache';
import { indexedDBModelStore } from '../src/integrations/minimind/indexeddb-model-store';
import { sha256Hex } from '../src/shared/crypto/sha256';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('MiniMind storage without OPFS', () => {
  it('constructs the actual SDK with an explicit cache when OPFS is absent', async () => {
    vi.stubGlobal('navigator', { storage: {}, userAgent: 'Test' });
    expect(() => new Wllama({ default: '/wllama.wasm' }, { cacheManager: createRuntimeCache() })).not.toThrow();
    const cache = createRuntimeCache();
    await cache.write('test.gguf', new Blob(['model']).stream(), {
      etag: 'test', originalSize: 5, originalURL: '/model.gguf',
    });
    expect(await (await cache.open('test.gguf'))?.text()).toBe('model');
    expect(await cache.list()).toHaveLength(1);
    await cache.clear();
    expect(await cache.list()).toEqual([]);
  });

  it('commits runtime streams only on success and leaves existing bytes intact on failure', async () => {
    const backend = new MemoryStorageBackend();
    await backend.write('a', new Blob(['good']).stream());
    await expect(backend.write('a', new ReadableStream({ start(c) { c.error(new Error('interrupted')); } })))
      .rejects.toThrow('interrupted');
    expect(await (await backend.read('a'))?.text()).toBe('good');
    expect(await backend.getSize('missing')).toBe(-1);
    await backend.delete('a'); expect(await backend.list()).toEqual([]);
  });

  it('keeps verified in-memory inference available when every persistent API is denied', async () => {
    vi.stubGlobal('caches', { open: async () => { throw new Error('denied'); } });
    vi.stubGlobal('indexedDB', undefined);
    const blob = new Blob(['verified']);
    const result = await loadVerifiedModel({ url: 'https://example.test/model.gguf', bytes: blob.size,
      sha256: await sha256Hex(await blob.arrayBuffer()) }, browserModelStore('https://example.test/model.gguf'),
    async () => new Response(blob));
    expect(result.persistent).toBe(false);
    expect(await result.blob.text()).toBe('verified');
    expect(() => new Wllama({ default: '/wllama.wasm' }, { cacheManager: createRuntimeCache() })).not.toThrow();
  });

  it('bounds blocked IndexedDB opens and closes connections that arrive after timeout', async () => {
    vi.useFakeTimers();
    const request = {} as IDBOpenDBRequest;
    vi.stubGlobal('indexedDB', { open: () => request });
    const result = indexedDBModelStore('/model', 'version', 25).read();
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(26); await assertion;
    const close = vi.fn(); Object.assign(request, { result: { close } });
    request.onsuccess?.({} as Event);
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits for the atomic IndexedDB commit and rejects an aborted replacement', async () => {
    const store = { clear: vi.fn(), put: vi.fn() };
    const transaction = { objectStore: () => store, abort: vi.fn(), error: null } as unknown as IDBTransaction;
    const close = vi.fn();
    const db = { transaction: () => transaction, close };
    vi.stubGlobal('indexedDB', { open() {
      const request = { result: db } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.({} as Event)); return request;
    } });
    const blob = new Blob(['complete']);
    let committed = false;
    const pending = indexedDBModelStore('/model', 'version').write(blob).then(() => { committed = true; });
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledWith(blob, 'version:/model'));
    expect(store.clear).toHaveBeenCalledOnce(); expect(committed).toBe(false);
    transaction.oncomplete?.({} as Event); await pending;
    expect(committed).toBe(true); expect(close).toHaveBeenCalledOnce();
    const failure = indexedDBModelStore('/model', 'version').write(blob);
    const assertion = expect(failure).rejects.toThrow('aborted');
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledTimes(2));
    transaction.onabort?.({} as Event); await assertion;
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('aborts and closes stalled IndexedDB transactions within the deadline', async () => {
    vi.useFakeTimers();
    const abort = vi.fn(); const close = vi.fn();
    const transaction = { objectStore: () => ({ get: () => ({}) }), abort };
    vi.stubGlobal('indexedDB', { open() {
      const request = { result: { transaction: () => transaction, close } } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.({} as Event)); return request;
    } });
    const assertion = expect(indexedDBModelStore('/model', 'version', 25).read()).rejects.toThrow('transaction timed out');
    await vi.advanceTimersByTimeAsync(26); await assertion;
    expect(abort).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
});
