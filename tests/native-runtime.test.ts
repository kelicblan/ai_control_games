import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostRequest, NativeRuntime } from '../src/integrations/models/native';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('native runtime lifetime', () => {
  it('reports transport failures without claiming the game is statically hosted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(hostRequest('status')).rejects.toThrow('模型接口连接失败');
  });
  it('identifies an HTML proxy response with endpoint and HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>gateway error</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })));
    await expect(hostRequest('select', {})).rejects.toThrow(/model-api\/select.*HTTP 502/);
  });
  it('distinguishes timeout from an unavailable endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('Timeout', 'TimeoutError'); }));
    await expect(hostRequest('status')).rejects.toThrow('模型接口请求超时');
  });
  it('loads on HTTP browsers without crypto.randomUUID', async () => {
    const webCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: webCrypto.getRandomValues.bind(webCrypto) });
    let token = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/select')) token = JSON.parse(String(options?.body)).token;
      return new Response(JSON.stringify(url.endsWith('/select') ? { operation: 1 } : { id: 'qwen08', operation: 1, stage: 'ready', progress: 1 }), { headers: { 'Content-Type': 'application/json' } });
    }));
    const runtime = new NativeRuntime('qwen08');
    await runtime.prepare(() => {}, new AbortController().signal);
    expect(token).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    await runtime.unload();
  });
  it('continues monitoring after ready and reports a crashed host', async () => {
    vi.useFakeTimers(); let crashed = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/select') ? { operation: 1 } : { id: 'qwen08', operation: 1, stage: crashed ? 'error' : 'ready', progress: crashed ? null : 1, error: '宿主已退出' }), { headers: { 'Content-Type': 'application/json' } })));
    const runtime = new NativeRuntime('qwen08'), report = vi.fn();
    await runtime.prepare(report, new AbortController().signal); crashed = true;
    await vi.advanceTimersByTimeAsync(2200);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'error', error: '宿主已退出' }));
    await runtime.unload();
  });
  it('cancels its own remote operation when model preparation fails', async () => {
    const unload: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/unload')) unload.push(JSON.parse(String(options?.body)));
      const data = url.endsWith('/select') ? { operation: 7 } : { id: 'qwen08', operation: 7, stage: 'error', progress: null, error: '加载失败' };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    }));
    const runtime = new NativeRuntime('qwen08');
    await expect(runtime.prepare(() => {}, new AbortController().signal)).rejects.toThrow('加载失败');
    expect(unload).toContainEqual(expect.objectContaining({ id: 'qwen08', operation: 7 }));
  });
  it('cleanup before select acknowledgment carries an owner token, never an unowned unload', async () => {
    let rejectSelect!: (error: Error) => void; let owner: string | undefined; const unload: { token?: string; operation?: number }[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      const data = JSON.parse(String(options?.body ?? '{}'));
      if (url.endsWith('/select')) { owner = data.token; return new Promise<Response>((_, reject) => { rejectSelect = reject; }); }
      unload.push(data); return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    }));
    const runtime = new NativeRuntime('qwen08');
    const prepared = runtime.prepare(() => {}, new AbortController().signal).catch(error => error);
    await Promise.resolve(); await runtime.unload(); rejectSelect(new DOMException('Aborted', 'AbortError')); await prepared;
    expect(owner).toMatch(/^[a-z0-9-]{36}$/i);
    expect(unload.every(item => item.token === owner)).toBe(true);
  });
});
