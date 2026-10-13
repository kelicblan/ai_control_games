import type { DialoguePayload, DialogueReply } from '../../../packages/npc-dialogue/src/types';
import type { ModelProgress } from './assets';
import { DialogueRequestError } from './protocol';
import type { ModelCommand, ModelMessage } from './protocol';

interface WorkerPort {
  postMessage(message: ModelCommand): void; terminate(): void;
  onmessage: ((event: MessageEvent<ModelMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
type Pending = { resolve(value?: DialogueReply): void; reject(error: Error): void; cleanup(): void };

/** 唯一共享 worker 持有模型与推理槽；React 重挂载不会再加载一份权重。 */
export class MiniMindRuntime {
  private worker?: WorkerPort;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private loading?: Promise<void>;
  private active = false;
  private state: ModelProgress = { stage: 'download', progress: 0 };
  private listeners = new Set<(value: ModelProgress) => void>();
  constructor(private factory = (): WorkerPort => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })) {}
  snapshot() { return { ...this.state }; }
  subscribe(listener: (value: ModelProgress) => void) {
    this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); };
  }
  private update(value: ModelProgress) {
    this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener(this.snapshot()));
  }
  private fail(error: Error) {
    this.worker?.terminate(); this.worker = undefined; this.loading = undefined;
    this.update({ stage: 'error', progress: 0, error: error.message });
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear();
  }
  private port() {
    if (!this.worker) {
      const worker = this.factory(); this.worker = worker;
      worker.onerror = event => { if (this.worker === worker) this.fail(new Error(event.message || 'WASM Worker 失败')); };
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        if (data.type === 'progress') { this.update(data.value); return; }
        const pending = this.pending.get(data.id); if (!pending) return;
        this.pending.delete(data.id); pending.cleanup();
        if (data.type === 'result') pending.resolve(data.value);
        else pending.reject(new DialogueRequestError(0, data.outcome, data.error));
      };
    }
    return this.worker;
  }
  private call(command: ModelCommand, signal?: AbortSignal, timeout = 240000): Promise<DialogueReply | undefined> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
      const worker = this.port(); let cancellation: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => this.fail(new Error('本地模型任务超时，稍后重试')), timeout);
      const abort = () => {
        worker.postMessage({ id: command.id, type: 'cancel' });
        // 取消后仍持有推理槽直到 worker 确认；5 秒无响应才销毁，避免两次原生推理重叠。
        cancellation = setTimeout(() => this.fail(new Error('取消推理超时，已重置模型')), 5000);
      };
      this.pending.set(command.id, { resolve, reject, cleanup() {
        clearTimeout(timer); clearTimeout(cancellation); signal?.removeEventListener('abort', abort);
      } });
      signal?.addEventListener('abort', abort, { once: true });
      worker.postMessage(command);
    });
  }
  async prepare() {
    if (!this.loading) {
      this.update({ stage: 'download', progress: 0, error: undefined });
      this.loading = this.call({ id: ++this.sequence, type: 'prepare',
        base: new URL(import.meta.env.BASE_URL, location.href).href }).then(() => {});
      const loading = this.loading;
      loading.catch(error => {
        if (this.loading === loading) this.fail(error instanceof Error ? error : new Error('模型加载失败'));
      });
    }
    return this.loading;
  }
  async generate(payload: DialoguePayload, signal: AbortSignal): Promise<DialogueReply> {
    if (this.state.stage !== 'ready') throw new Error('本地模型未就绪');
    if (this.active) throw new DialogueRequestError(0, 'busy');
    this.active = true;
    try {
      const result = await this.call({ id: ++this.sequence, type: 'generate', payload }, signal, 30000);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!result) throw new Error('缺少模型回复');
      return result;
    } finally { this.active = false; }
  }
}
export const minimindRuntime = new MiniMindRuntime();
