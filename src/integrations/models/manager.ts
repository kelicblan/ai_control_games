import type { DialoguePayload, DialogueReply } from '../../../packages/npc-dialogue/src/types';
import { DialogueRequestError } from '../minimind/protocol';

export interface ModelDescriptor { id: string; name: string; backend: 'wasm' | 'native' | 'remote'; available?: boolean; bytes?: number; threads?: number; context?: number }
export interface ModelProgress { stage: string; progress: number | null; cached?: boolean; persistent?: boolean; error?: string }
/** Browser/native desktop hosts implement this contract; game code never starts a process. */
export interface ModelRuntime {
  prepare(report: (value: ModelProgress) => void, signal: AbortSignal): Promise<void>;
  generate(payload: DialoguePayload, signal: AbortSignal): Promise<DialogueReply>;
  unload(): void | Promise<void>;
}
export interface RuntimeState extends ModelProgress { startedAt: number; autoRetries: number; retryStopped: boolean }
export interface ModelState extends ModelProgress { selectedId: string; activeId?: string; generation: number; startedAt: number; storageError?: string; autoRetries?: number; retryStopped?: boolean; mini: RuntimeState; preferred: RuntimeState }
interface Options {
  mini: ModelRuntime; native(id: string): ModelRuntime; remote?(id: string): ModelRuntime; storage?: Pick<Storage, 'getItem' | 'setItem'>;
  models?: ModelDescriptor[]; cooldownMs?: number;
}
export const MODEL_SETTINGS_KEY = 'campmind-dialogue-model-v1';
export const MINI_MODEL: ModelDescriptor = { id: 'minimind3', name: 'MiniMind3', backend: 'wasm', available: true };
const idle = (): RuntimeState => ({ stage: 'idle', progress: null, startedAt: 0, autoRetries: 0, retryStopped: false });
const message = (error: unknown) => error instanceof Error ? error.message : '模型加载失败';

/** 内置模型与优先模型独立持有；切换不卸载内置模型。 */
export class ModelManager {
  private state: ModelState; private models: ModelDescriptor[];
  private listeners = new Set<(value: ModelState) => void>();
  private controller = new AbortController(); private runtime?: ModelRuntime; private preparing?: Promise<void>;
  private miniController = new AbortController(); private miniLoading?: Promise<void>;
  private miniVersion = 0;
  private miniTimer?: ReturnType<typeof setTimeout>; private preferredTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(private options: Options) {
    this.models = (options.models ?? []).filter(m => m.id !== 'minimind3'); let selectedId = 'minimind3';
    try { const saved = options.storage?.getItem(MODEL_SETTINGS_KEY); if (saved && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(saved)) selectedId = saved; } catch {}
    this.state = { selectedId, stage: 'idle', progress: null, generation: 0, startedAt: 0, mini: idle(), preferred: idle() };
  }
  snapshot(): ModelState { return { ...this.state, mini: { ...this.state.mini }, preferred: { ...this.state.preferred } }; }
  catalog() { return this.models.map(model => ({ ...model })); }
  setCatalog(models: ModelDescriptor[]) { this.models = models.filter(item => item.id !== 'minimind3'); this.notify(); }
  subscribe(listener: (value: ModelState) => void) { this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); }; }
  private notify() {
    const preferredReady = this.state.selectedId !== 'minimind3' && this.state.preferred.stage === 'ready';
    const activeId = preferredReady ? this.state.selectedId : this.state.mini.stage === 'ready' ? 'minimind3' : undefined;
    const progress = preferredReady ? this.state.preferred : this.state.mini;
    this.state = { ...this.state, ...progress, activeId, stage: activeId ? 'ready' : progress.stage };
    this.listeners.forEach(listener => listener(this.snapshot()));
  }
  private updateMini(value: Partial<RuntimeState>) { this.state.mini = { ...this.state.mini, ...value }; this.notify(); }
  private updatePreferred(value: Partial<RuntimeState>) { this.state.preferred = { ...this.state.preferred, ...value }; this.notify(); }
  async select(id: string) {
    if (id !== 'minimind3' && !this.models.some(model => model.id === id)) throw new Error('模型尚未登记，请刷新模型列表');
    try { this.options.storage?.setItem(MODEL_SETTINGS_KEY, id); this.state.storageError = undefined; }
    catch { this.state.storageError = '设备未允许保存设置，本次切换仍会生效'; }
    this.state.preferred = idle(); void this.prepareMini(); await this.loadPreferred(id);
  }
  async prepare(force = false) {
    if (this.disposed) return;
    const mini = force && this.state.mini.stage === 'error' ? this.retryMini() : this.prepareMini();
    let preferred = this.preparing;
    if (this.state.selectedId !== 'minimind3' && (force || this.state.preferred.stage === 'idle')) {
      if (force) this.state.preferred = idle();
      preferred = this.loadPreferred(this.state.selectedId);
    }
    await Promise.all([mini, preferred]);
  }
  retryMini() {
    if (this.miniLoading || this.disposed) return this.miniLoading ?? Promise.resolve();
    clearTimeout(this.miniTimer); this.state.mini = idle(); return this.prepareMini();
  }
  retryAutomatically() {
    // 独立定时器管理重试；场景轮询不得重置预算。
    return this.preparing ?? this.miniLoading ?? Promise.resolve();
  }
  prepareMini(): Promise<void> {
    if (this.disposed || this.state.mini.stage === 'ready') return Promise.resolve();
    if (this.miniLoading) return this.miniLoading;
    if (this.state.mini.stage === 'error') return Promise.resolve();
    const signal = this.miniController.signal;
    const version = ++this.miniVersion;
    const current = () => !signal.aborted && version === this.miniVersion;
    this.updateMini({ stage: 'initialize', progress: null, startedAt: Date.now(), error: undefined });
    const task = (async () => {
      try {
        await this.options.mini.prepare(value => {
          if (!current()) return;
          if (value.stage === 'idle' && this.state.mini.stage === 'ready') {
            this.updateMini({ ...value, error: undefined });
            // A stale-caption cancellation may need a fresh Worker, but is not a model failure.
            queueMicrotask(() => { if (current()) void this.prepareMini(); });
          } else if (value.stage === 'error' && this.state.mini.stage === 'ready') this.failedMini(new Error(value.error ?? 'MiniMind3 运行异常'));
          else this.updateMini(value);
        }, signal);
        if (current()) this.updateMini({ stage: 'ready', progress: 1, autoRetries: 0, retryStopped: false });
      } catch (error) {
        if (!current()) return;
        this.failedMini(error);
      }
    })();
    this.miniLoading = task;
    void task.finally(() => { if (this.miniLoading === task) this.miniLoading = undefined; });
    return task;
  }
  private failedMini(error: unknown) {
    const retries = this.state.mini.autoRetries;
    this.updateMini({ stage: 'error', progress: null, error: message(error), retryStopped: retries >= 2 });
    clearTimeout(this.miniTimer);
    if (retries < 2) this.miniTimer = setTimeout(() => {
      this.state.mini = { ...idle(), autoRetries: retries + 1 }; void this.prepareMini();
    }, 1000 * (retries + 1));
  }
  private failedPreferred(error: unknown, current: () => boolean) {
    if (!current()) return;
    if (error instanceof Error && error.name === 'AbortError') {
      clearTimeout(this.preferredTimer); this.updatePreferred({ stage: 'cancelled', progress: null, error: message(error) }); return;
    }
    const retries = this.state.preferred.autoRetries;
    this.updatePreferred({ stage: 'error', progress: null, error: message(error), retryStopped: retries >= 2 });
    clearTimeout(this.preferredTimer);
    if (retries < 2) this.preferredTimer = setTimeout(() => {
      if (!current()) return;
      this.state.preferred.autoRetries = retries + 1; void this.loadPreferred(this.state.selectedId, false);
    }, this.options.cooldownMs ?? 30000);
  }
  private loadPreferred(id: string, changeSelection = true) {
    clearTimeout(this.preferredTimer);
    this.controller.abort(); const controller = new AbortController(); this.controller = controller;
    const old = this.runtime; this.runtime = undefined;
    if (changeSelection) this.state.generation++;
    const generation = this.state.generation;
    this.state.selectedId = id;
    const current = () => !this.disposed && generation === this.state.generation && this.controller === controller && !controller.signal.aborted;
    this.updatePreferred({ stage: id === 'minimind3' ? 'idle' : 'initialize', progress: null, error: undefined, startedAt: Date.now() });
    const task = (async () => {
      try {
        await old?.unload(); if (!current() || id === 'minimind3') return;
        const descriptor = this.models.find(m => m.id === id);
        if (!descriptor || descriptor.available === false) throw new Error('优先模型不可用，请刷新列表或修改配置');
        const runtime = descriptor.backend === 'remote' ? this.options.remote?.(id) : this.options.native(id);
        if (!runtime) throw new Error('没有可用的远程模型适配器');
        this.runtime = runtime;
        await runtime.prepare(value => {
          if (!current()) return;
          if (value.stage === 'error') this.failedPreferred(new Error(value.error ?? '优先模型连接异常'), current);
          else this.updatePreferred(value);
        }, controller.signal);
        if (current() && !['error', 'cancelled'].includes(this.state.preferred.stage)) this.updatePreferred({ stage: 'ready', progress: 1, autoRetries: 0, retryStopped: false });
      } catch (error) { this.failedPreferred(error, current); }
    })();
    this.preparing = task;
    void task.finally(() => { if (this.preparing === task) this.preparing = undefined; });
    return task;
  }
  async generate(payload: DialoguePayload, signal: AbortSignal,
    accept: (reply: DialogueReply) => boolean = () => true): Promise<DialogueReply> {
    const generation = this.state.generation, id = this.state.selectedId;
    const check = () => { if (signal.aborted || generation !== this.state.generation || this.disposed) throw new DOMException('请求已取消或模型已切换', 'AbortError'); };
    check();
    if (this.runtime && this.state.preferred.stage === 'ready' && id !== 'minimind3') {
      const runtime = this.runtime;
      const combined = AbortSignal.any([signal, this.controller.signal]);
      try {
        const reply = await runtime.generate(payload, combined); check(); combined.throwIfAborted();
        if (!accept(reply)) throw new DialogueRequestError(0, 'skipped', '优先模型台词未通过校验');
        return { ...reply, source: `${this.models.find(m => m.id === id)?.backend === 'remote' ? 'remote' : 'native'}:${id}` };
      } catch (error) {
        check(); combined.throwIfAborted();
        if (!(error instanceof DialogueRequestError && (error.outcome === 'skipped' || error.outcome === 'busy')))
          this.failedPreferred(error, () => generation === this.state.generation && this.runtime === runtime && !this.disposed);
      }
    }
    check(); if (this.state.mini.stage !== 'ready') throw new Error('MiniMind3 尚未就绪');
    const controller = new AbortController();
    const unsubscribe = this.subscribe(value => { if (value.generation !== generation) controller.abort(); });
    try {
      const reply = await this.options.mini.generate(payload, AbortSignal.any([signal, controller.signal, this.miniController.signal])); check();
      if (!accept(reply)) throw new DialogueRequestError(0, 'skipped', 'MiniMind3 台词未通过校验');
      return { ...reply, source: 'minimind3' };
    } catch (error) {
      check();
      if (!(error instanceof DialogueRequestError && error.outcome) && this.state.mini.stage === 'ready') {
        this.options.mini.unload(); this.failedMini(error);
      }
      throw error;
    } finally { unsubscribe(); }
  }
  dispose() {
    this.disposed = true; clearTimeout(this.miniTimer); clearTimeout(this.preferredTimer);
    this.controller.abort(); this.miniController.abort(); void this.runtime?.unload(); this.options.mini.unload(); this.listeners.clear();
  }
}
