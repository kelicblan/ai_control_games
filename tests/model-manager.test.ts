import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelManager, type ModelRuntime } from '../src/integrations/models/manager';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function runtime(wait = Promise.resolve()): ModelRuntime {
  return { prepare: vi.fn(async (progress) => { progress({ stage: 'load', progress: .4 }); await wait; }),
    unload: vi.fn(), generate: vi.fn(async payload => ({ requestId: payload.requestId, text: '我先照顾好自己。', source: 'unused', latencyMs: 1 })) };
}
const managers: ModelManager[] = [];
afterEach(() => { managers.forEach(m => m.dispose()); managers.length = 0; vi.useRealTimers(); });
function setup() {
  const values = new Map<string, string>();
  const mini = runtime(), a = runtime(), b = runtime();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const models = [{ id: 'a', name: 'A', backend: 'native' as const }, { id: 'b', name: 'B', backend: 'native' as const }];
  const manager = new ModelManager({ mini, native: id => id === 'a' ? a : b, storage, models });
  managers.push(manager);
  return { manager, mini, a, b, storage, models };
}
describe('game-level model manager', () => {
  it('constructor is side-effect free; page bootstrap explicitly prepares MiniMind', () => {
    const { manager, mini } = setup(); expect(manager.snapshot().selectedId).toBe('minimind3'); expect(mini.prepare).not.toHaveBeenCalled();
  });
  it('selection immediately loads, exposes real progress, persists and restores selection', async () => {
    const { manager, a, mini, storage, models } = setup(); const pending = deferred();
    a.prepare = vi.fn(async report => { report({ stage: 'load', progress: .27 }); await pending.promise; });
    const selected = manager.select('a'); await Promise.resolve(); await Promise.resolve();
    expect(manager.snapshot()).toMatchObject({ selectedId: 'a', activeId: 'minimind3', preferred: { stage: 'load', progress: .27 } });
    pending.resolve(); await selected; expect(manager.snapshot().activeId).toBe('a');
    const restored = new ModelManager({ mini, native: () => a, storage, models }); expect(restored.snapshot().selectedId).toBe('a');
  });
  it('late loading progress and late replies cannot overwrite the newly selected model', async () => {
    const { manager, a, b } = setup(); const load = deferred(); let late!: (value: { stage: 'load'; progress: number }) => void;
    a.prepare = vi.fn(async report => { late = report; await load.promise; });
    const old = manager.select('a'); await Promise.resolve(); await Promise.resolve();
    await manager.select('b'); late({ stage: 'load', progress: .99 }); load.resolve(); await old;
    expect(manager.snapshot()).toMatchObject({ selectedId: 'b', activeId: 'b', stage: 'ready' }); expect(b.prepare).toHaveBeenCalledOnce();
    const generation = deferred(); a.generate = vi.fn(async payload => { await generation.promise; return { requestId: payload.requestId, text: '旧模型的回答。', source: 'a', latencyMs: 1 }; });
    a.prepare = vi.fn(async () => {}); await manager.select('a');
    const reply = manager.generate({ requestId: 'r' } as never, new AbortController().signal).catch(e => e);
    await manager.select('b'); generation.resolve(); expect((await reply).name).toBe('AbortError');
  });
  it('failed selection stays selected with an error and retry can recover', async () => {
    const { manager, a } = setup(); a.prepare = vi.fn().mockRejectedValueOnce(new Error('模型缺失')).mockResolvedValueOnce(undefined);
    await manager.select('a'); expect(manager.snapshot()).toMatchObject({ selectedId: 'a', activeId: 'minimind3', preferred: { stage: 'error', error: '模型缺失' } });
    await manager.prepare(true); expect(manager.snapshot().activeId).toBe('a');
  });
  it('stops after two automatic retries and only an explicit user retry resets the budget', async () => {
    vi.useFakeTimers();
    const { manager, a } = setup(); a.prepare = vi.fn().mockRejectedValue(new Error('连接失败'));
    await manager.select('a');
    await vi.advanceTimersByTimeAsync(90000);
    for (let i = 0; i < 10; i++) await manager.retryAutomatically();
    expect(a.prepare).toHaveBeenCalledTimes(3);
    expect(manager.snapshot()).toMatchObject({ activeId: 'minimind3', preferred: { stage: 'error', autoRetries: 2, retryStopped: true } });
    await manager.prepare(true);
    expect(a.prepare).toHaveBeenCalledTimes(4);
    expect(manager.snapshot()).toMatchObject({ preferred: { autoRetries: 0, retryStopped: false } });
  });
});
