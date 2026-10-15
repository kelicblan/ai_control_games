import { CacheManager } from '@wllama/wllama/esm/index.js';
import type { StorageBackend } from '@wllama/wllama/esm/storage/index';

/** SDK bookkeeping only. Verified weights are supplied directly to loadModel as a Blob. */
export class MemoryStorageBackend implements StorageBackend {
  private readonly files = new Map<string, Blob>();
  isSupported() { return true; }
  async read(key: string) { return this.files.get(key) ?? null; }
  async write(key: string, stream: ReadableStream) {
    const blob = await new Response(stream).blob();
    this.files.set(key, blob);
  }
  async getSize(key: string) { return this.files.get(key)?.size ?? -1; }
  async list() { return [...this.files].map(([key, blob]) => ({ key, size: blob.size })); }
  async delete(key: string) { this.files.delete(key); }
}

export function createRuntimeCache() { return new CacheManager([new MemoryStorageBackend()]); }
