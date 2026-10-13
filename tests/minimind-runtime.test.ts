import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniMindRuntime } from '../src/integrations/minimind/runtime';
import type { ModelCommand, ModelMessage } from '../src/integrations/minimind/protocol';
import type { DialoguePayload } from '../src/games/camp/dialogue';

const payload = { requestId: 'a' } as DialoguePayload;
class FakeWorker {
  onmessage: ((event: MessageEvent<ModelMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn<(command: ModelCommand) => void>(); terminate = vi.fn();
  send(data: ModelMessage) { this.onmessage?.({ data } as MessageEvent<ModelMessage>); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('shared WASM runtime ownership', () => {
  async function setup() {
    vi.stubGlobal('location', { href: 'http://localhost:5173/' });
    const worker = new FakeWorker(); const runtime = new MiniMindRuntime(() => worker);
    const prepared = runtime.prepare();
    worker.send({ id: 1, type: 'progress', value: { stage: 'ready', progress: 1 } });
    worker.send({ id: 1, type: 'result' }); await prepared;
    return { runtime, worker };
  }
  it('shares a single loading task and reports readiness only after worker acknowledgement', async () => {
    vi.stubGlobal('location', { href: 'http://localhost/' });
    const worker = new FakeWorker(); const factory = vi.fn(() => worker); const runtime = new MiniMindRuntime(factory);
    const first = runtime.prepare(), second = runtime.prepare();
    expect(factory).toHaveBeenCalledOnce(); expect(worker.postMessage).toHaveBeenCalledOnce();
    worker.send({ id: 1, type: 'result' }); await Promise.all([first, second]);
  });
  it('holds the slot after cancellation until native work acknowledges it', async () => {
    const { runtime, worker } = await setup(); const abort = new AbortController();
    const first = runtime.generate(payload, abort.signal); const rejected = expect(first).rejects.toThrow();
    abort.abort();
    await expect(runtime.generate(payload, new AbortController().signal)).rejects.toMatchObject({ outcome: 'busy' });
    worker.send({ id: 2, type: 'error', error: 'Aborted' }); await rejected;
    const next = runtime.generate(payload, new AbortController().signal);
    worker.send({ id: 3, type: 'result', value: { requestId: 'a', text: '我来休息一下。', source: 'minimind3', latencyMs: 3 } });
    expect((await next).text).toBe('我来休息一下。');
  });
  it('terminates a stuck cancelled worker before allowing reload', async () => {
    vi.useFakeTimers(); const { runtime, worker } = await setup(); const controller = new AbortController();
    const task = runtime.generate(payload, controller.signal); const rejected = expect(task).rejects.toThrow('取消推理超时');
    controller.abort(); await vi.advanceTimersByTimeAsync(5001); await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(runtime.snapshot().stage).toBe('error');
  });
});
