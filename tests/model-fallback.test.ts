import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelManager, type ModelRuntime } from '../src/integrations/models/manager';
import { DialogueRequestError } from '../src/integrations/minimind/protocol';

function runtime(): ModelRuntime {
  return { prepare: vi.fn(async () => {}), unload: vi.fn(), generate: vi.fn(async p => ({ requestId: p.requestId, text: '我们一起慢慢商量。', source: '', latencyMs: 1 })) };
}
const payload = { requestId: 'test', prompt: '你好' } as never;
const managers: ModelManager[] = [];
function setup() {
  const mini = runtime(), preferred = runtime();
  const manager = new ModelManager({ mini, native: () => preferred, models: [{ id: 'a', name: 'A', backend: 'native' }], cooldownMs: 30000 });
  managers.push(manager); return { mini, preferred, manager };
}
afterEach(() => { managers.forEach(m => m.dispose()); managers.length = 0; vi.useRealTimers(); });
describe('always available MiniMind fallback', () => {
  it('tries MiniMind when the preferred reply fails the host caption validator', async () => {
    const { manager, preferred, mini } = setup(); await manager.prepare(); await manager.select('a');
    preferred.generate = vi.fn(async p => ({ requestId:p.requestId,text:'我去帐篷下躲雨。',source:'',latencyMs:1 }));
    const reply = await manager.generate(payload, new AbortController().signal, reply => !reply.text.includes('帐篷'));
    expect(reply.source).toBe('minimind3'); expect(mini.generate).toHaveBeenCalledOnce();
    expect(manager.snapshot().preferred.stage).toBe('ready');
  });
  it('falls back on preferred skipped output but keeps busy and cancellation separate', async () => {
    const { manager, preferred, mini } = setup(); await manager.prepare(); await manager.select('a');
    preferred.generate = vi.fn().mockRejectedValue(new DialogueRequestError(0,'skipped'));
    expect((await manager.generate(payload,new AbortController().signal)).source).toBe('minimind3');
    expect(mini.generate).toHaveBeenCalledOnce(); expect(manager.snapshot().preferred.stage).toBe('ready');
  });
  it('retains code fallback without unloading a healthy MiniMind when both model captions are invalid', async () => {
    const { manager, mini } = setup(); await manager.prepare();
    await expect(manager.generate(payload,new AbortController().signal,()=>false)).rejects.toMatchObject({outcome:'skipped'});
    expect(mini.unload).not.toHaveBeenCalled(); expect(manager.snapshot().mini.stage).toBe('ready');
  });
  it('silently rebuilds a cancelled fallback Worker while healthy preferred requests remain exclusive', async () => {
    const { manager, mini, preferred } = setup(); let report!: Parameters<ModelRuntime['prepare']>[0];
    mini.prepare = vi.fn(async listener => { report = listener; });
    await manager.prepare(); await manager.select('a');
    report({ stage: 'idle', progress: 0 }); await Promise.resolve(); await Promise.resolve();
    expect(mini.prepare).toHaveBeenCalledTimes(2);
    expect(manager.snapshot().mini).toMatchObject({ error: undefined, autoRetries: 0, retryStopped: false });
    const result = await manager.generate(payload, new AbortController().signal);
    expect(result.source).toBe('native:a'); expect(preferred.generate).toHaveBeenCalledOnce();
    expect(mini.generate).not.toHaveBeenCalled(); expect(manager.snapshot().preferred.stage).toBe('ready');
  });
  it('prepares MiniMind once, excludes it from optional catalog, and retains it across switches', async () => {
    const { manager, mini } = setup(); await manager.prepare(); await manager.prepare();
    expect(mini.prepare).toHaveBeenCalledTimes(1); expect(manager.catalog().some(m => m.id === 'minimind3')).toBe(false);
    await manager.select('a'); await manager.select('minimind3');
    expect(mini.unload).not.toHaveBeenCalled(); expect(mini.prepare).toHaveBeenCalledTimes(1);
    expect(manager.snapshot().activeId).toBe('minimind3');
  });
  it('serves MiniMind while a preferred model loads', async () => {
    const { manager, preferred } = setup(); await manager.prepare(); let finish!: () => void;
    preferred.prepare = vi.fn(() => new Promise<void>(r => { finish = r; }));
    const selection = manager.select('a'); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(manager.snapshot()).toMatchObject({ selectedId: 'a', activeId: 'minimind3', stage: 'ready' });
    expect((await manager.generate(payload, new AbortController().signal)).source).toBe('minimind3');
    finish(); await selection; expect(manager.snapshot().activeId).toBe('a');
  });
  it('falls back on prepare failure, keeps user preference and recovers after a cooldown', async () => {
    vi.useFakeTimers(); const { manager, preferred } = setup(); await manager.prepare();
    preferred.prepare = vi.fn().mockRejectedValueOnce(new Error('离线')).mockResolvedValue(undefined);
    await manager.select('a'); expect(manager.snapshot()).toMatchObject({ selectedId: 'a', activeId: 'minimind3', preferred: { stage: 'error', error: '离线' } });
    await vi.advanceTimersByTimeAsync(29999); expect(preferred.prepare).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(manager.snapshot().activeId).toBe('a');
  });
  it('retries the same request with MiniMind after a preferred generation fault', async () => {
    const { manager, preferred, mini } = setup(); await manager.prepare(); await manager.select('a');
    preferred.generate = vi.fn().mockRejectedValue(new Error('HTTP 503'));
    const reply = await manager.generate(payload, new AbortController().signal);
    expect(reply.source).toBe('minimind3'); expect(mini.generate).toHaveBeenCalledWith(payload, expect.any(AbortSignal));
    await manager.generate(payload, new AbortController().signal); expect(preferred.generate).toHaveBeenCalledTimes(1);
    expect(manager.snapshot().selectedId).toBe('a');
  });
  it('cancels explicitly but uses MiniMind for a busy preferred model without marking it failed', async () => {
    const { manager, preferred, mini } = setup(); await manager.prepare(); await manager.select('a');
    const abort = new AbortController(); preferred.generate = vi.fn(async () => { abort.abort(); throw new Error('cancel'); });
    await expect(manager.generate(payload, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mini.generate).not.toHaveBeenCalled();
    preferred.generate = vi.fn().mockRejectedValue(new DialogueRequestError(409, 'busy'));
    await expect(manager.generate(payload, new AbortController().signal)).resolves.toMatchObject({ source: 'minimind3' });
    expect(mini.generate).toHaveBeenCalledOnce(); expect(manager.snapshot().activeId).toBe('a');
  });
  it('discards late preferred replies after switching and does not call fallback', async () => {
    const { manager, preferred, mini } = setup(); await manager.prepare(); await manager.select('a'); let finish!: () => void;
    preferred.generate = vi.fn(async p => { await new Promise<void>(r => { finish = r; }); return { requestId: p.requestId, source: '', text: '旧回复', latencyMs: 1 }; });
    const request = manager.generate(payload, new AbortController().signal); await manager.select('minimind3'); finish();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' }); expect(mini.generate).not.toHaveBeenCalled();
  });
  it('bounds independent MiniMind startup retries even if no game scene has opened', async () => {
    vi.useFakeTimers(); const { manager, mini } = setup(); mini.prepare = vi.fn().mockRejectedValue(new Error('WASM failed'));
    await manager.prepare(); await vi.advanceTimersByTimeAsync(20000);
    expect(mini.prepare).toHaveBeenCalledTimes(3); expect(manager.snapshot().mini).toMatchObject({ stage: 'error', autoRetries: 2, retryStopped: true });
    await manager.retryMini(); expect(mini.prepare).toHaveBeenCalledTimes(4);
    expect(manager.snapshot().mini.retryStopped).toBe(false);
  });
  it('recovers a crashed MiniMind independently while a preferred request is running', async () => {
    vi.useFakeTimers(); const { manager, mini, preferred } = setup();
    let report!: Parameters<ModelRuntime['prepare']>[0]; mini.prepare = vi.fn(async callback => { report = callback; });
    await manager.prepare(); await manager.select('a'); let finish!: () => void;
    preferred.generate = vi.fn(async p => { await new Promise<void>(r => { finish = r; }); return { requestId: p.requestId, source: '', text: '仍然可用。', latencyMs: 2 }; });
    const reply = manager.generate(payload, new AbortController().signal);
    report({ stage: 'error', progress: null, error: 'worker crash' });
    await vi.advanceTimersByTimeAsync(1100); expect(mini.prepare).toHaveBeenCalledTimes(2);
    finish(); expect((await reply).source).toBe('native:a'); expect(manager.snapshot().activeId).toBe('a');
  });
  it('does not cancel an in-flight fallback while recovering the preferred model', async () => {
    vi.useFakeTimers(); const { manager, preferred, mini } = setup(); await manager.prepare();
    preferred.prepare = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined); await manager.select('a');
    let finish!: () => void; let received!: AbortSignal;
    mini.generate = vi.fn(async (p, signal) => { received = signal; await new Promise<void>(r => { finish = r; }); return { requestId: p.requestId, text: '内置回复。', source: '', latencyMs: 2 }; });
    const reply = manager.generate(payload, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(30001); expect(manager.snapshot().activeId).toBe('a'); expect(received.aborted).toBe(false);
    finish(); expect((await reply).source).toBe('minimind3');
  });
  it('cancels in-flight fallback on an explicit selection change', async () => {
    const { manager, mini } = setup(); await manager.prepare(); let finish!: () => void; let received!: AbortSignal;
    mini.generate = vi.fn(async (p, signal) => { received = signal; await new Promise<void>(r => { finish = r; }); return { requestId: p.requestId, text: '旧兜底。', source: '', latencyMs: 2 }; });
    const reply = manager.generate(payload, new AbortController().signal); await manager.select('a');
    expect(received.aborted).toBe(true); finish(); await expect(reply).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('ignores a late MiniMind report from a failed earlier preparation', async () => {
    const { manager, mini } = setup(); const reports: Parameters<ModelRuntime['prepare']>[0][] = [];
    mini.prepare = vi.fn(async report => { reports.push(report); if (reports.length === 1) throw new Error('failed'); });
    await manager.prepare(); await manager.retryMini();
    reports[0]({ stage: 'error', progress: null, error: 'late error' });
    expect(manager.snapshot().mini.stage).toBe('ready');
  });
});
