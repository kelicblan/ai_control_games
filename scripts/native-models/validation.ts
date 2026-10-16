import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

export async function resolveModelPath(root: string, relative: string) {
  if (typeof relative !== 'string' || /[\r\n]/.test(relative) || path.isAbsolute(relative) || /^[a-z]:/i.test(relative)) throw new Error('模型必须位于本项目目录内');
  const base = await realpath(root), target = await realpath(path.resolve(root, relative));
  const relation = path.relative(base, target);
  if (relation.startsWith('..') || path.isAbsolute(relation) || !target.toLowerCase().endsWith('.gguf')) throw new Error('模型路径越出项目或不是 GGUF');
  return target;
}
export function checkOrigin(headers: Record<string, string | string[] | undefined>) {
  if (headers['x-campmind-request'] !== '1') return false;
  if (!headers.origin) return true; // Native desktop host / local CLI has no browser Origin.
  try { return new URL(String(headers.origin)).host === headers.host && /^https?:/.test(String(headers.origin)); } catch { return false; }
}
export function parseRouterEvent(raw: unknown, id: string): { stage: 'load' | 'ready' | 'error'; progress: number | null; error?: string } | null {
  const event = raw as { model?: string; event?: string; data?: { status?: string; progress?: { value?: number }; error?: unknown } };
  if (!event || event.model !== id || event.event !== 'model_status') return null;
  if (event.data?.status === 'loaded') return { stage: 'ready', progress: 1 };
  if (event.data?.status === 'loading') {
    const value = event.data.progress?.value;
    return { stage: 'load', progress: typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null };
  }
  if (event.data?.status === 'failed') return { stage: 'error', progress: null, error: '原生模型加载失败' };
  return null;
}
export async function verifyModel(file: string, expected: string, signal: AbortSignal, progress: (bytes: number) => void) {
  if (!/^[a-f0-9]{64}$/i.test(expected)) throw new Error('模型清单缺少有效 SHA-256，请先登记校验值');
  const stream = createReadStream(file, { highWaterMark: 4 * 1024 * 1024, signal });
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of stream) { signal.throwIfAborted(); hash.update(chunk); bytes += chunk.length; progress(bytes); }
  if (hash.digest('hex') !== expected.toLowerCase()) throw new Error('模型 SHA-256 不匹配，已阻止加载');
}
