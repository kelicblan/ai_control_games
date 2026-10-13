import { sha256Hex } from '../../shared/crypto/sha256';

export const MINIMIND_ASSET = {
  file: 'minimind-3.q8.gguf', bytes: 68189920,
  sha256: 'c994601ed72cb24addd206ed28ee7e8cea0283081a0434947c4e1e7a6d2ce45e',
};
export const MODEL_CACHE = `minimind-model-${MINIMIND_ASSET.sha256}`;
export interface ModelAsset { url: string; bytes: number; sha256: string }
export interface ModelStore {
  read(): Promise<Blob | undefined>; write(blob: Blob): Promise<void>; remove(): Promise<void>;
}
export type ModelProgress = { stage: 'download' | 'verify' | 'load' | 'ready' | 'error';
  progress: number; cached?: boolean; persistent?: boolean; error?: string };

/** 下载校验在模型 worker 中运行；哈希计算不占用模拟和渲染线程。 */
export async function loadVerifiedModel(asset: ModelAsset, store: ModelStore,
  download: typeof fetch = fetch, progress: (value: ModelProgress) => void = () => {}) {
  const verify = async (blob: Blob) => blob.size === asset.bytes
    && await sha256Hex(await blob.arrayBuffer()) === asset.sha256;
  let cached: Blob | undefined;
  try { cached = await store.read(); } catch { /* 隐私模式或存储不可用时，继续使用经过校验的内存模型。 */ }
  if (cached) {
    progress({ stage: 'verify', progress: 1, cached: true });
    if (await verify(cached)) return { blob: cached, cached: true, persistent: true };
    await store.remove().catch(() => {});
  }
  progress({ stage: 'download', progress: 0 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  let blob: Blob;
  try {
    const response = await download(asset.url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`模型下载失败 (${response.status})`);
    if (!response.body) blob = await response.blob();
    else {
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = []; let received = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > asset.bytes) { await reader.cancel(); throw new Error('模型文件大小不符'); }
        chunks.push(value as Uint8Array<ArrayBuffer>);
        progress({ stage: 'download', progress: received / asset.bytes });
      }
      blob = new Blob(chunks, { type: 'application/octet-stream' });
    }
  } finally { clearTimeout(timeout); }
  progress({ stage: 'verify', progress: 1 });
  if (!await verify(blob)) throw new Error('模型完整性校验失败');
  let persistent = true;
  try { await store.write(blob); } catch { persistent = false; }
  return { blob, cached: false, persistent };
}

export function browserModelStore(url: string): ModelStore {
  return {
    async read() { return (await (await caches.open(MODEL_CACHE)).match(url))?.blob(); },
    async write(blob) {
      // 仅在长度和 SHA-256 都通过后提交完整响应；绝不缓存半截下载。
      await (await caches.open(MODEL_CACHE)).put(url, new Response(blob));
      const old = (await caches.keys()).filter(key => key.startsWith('minimind-model-') && key !== MODEL_CACHE);
      await Promise.all(old.map(key => caches.delete(key)));
    },
    async remove() { await (await caches.open(MODEL_CACHE)).delete(url); },
  };
}
