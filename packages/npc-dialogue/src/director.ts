import type { Cancellation, DialogueCandidate, DialogueOptions, DialoguePayload, DialogueSource, DialogueStatus } from './types';
interface Job<T> { candidate: DialogueCandidate<T>; refill: boolean; retries: number }
interface Pool { actorId: string; lines: { text: string; source: DialogueSource }[]; until: number }

/**
 * 通用异步调度器，只拥有语言任务，不拥有世界。所有时间、取消和提交能力由宿主注入。
 * generation 是会话隔离屏障：取消并不保证后端立刻停止，因此任何返回值仍须核对代际。
 */
export class DialogueDirector<TTicket> {
  private generation = 0;
  private sequence = 0;
  private seen = new Map<string, string>();
  private cooldown = new Map<string, number>();
  private recent = new Map<string, string[]>();
  private queue = new Map<string, Job<TTicket>>();
  private pool = new Map<string, Pool>();
  private active: Cancellation | null = null;
  private activeActor: string | null = null;
  private activeTicket?: TTicket;
  private cancelActiveTimeout?: () => void;
  private retryAt = 0;
  private cancelWake?: () => void;
  private disposed = false;
  private committing = false;
  private status: DialogueStatus = { mode: 'checking', enabled: true, generated: 0, cached: 0,
    discarded: 0, failures: 0, latencyMs: 0, poolSize: 0, lines: {} };
  constructor(private options: DialogueOptions<TTicket>) {}
  snapshot(): DialogueStatus { return { ...this.status, lines: { ...this.status.lines } }; }
  private notify() {
    this.status.poolSize = [...this.pool.values()].reduce((sum, entry) => sum + entry.lines.length, 0);
    this.options.onStatus?.(this.snapshot());
  }
  setMode(mode: DialogueStatus['mode']) { this.status.mode = mode; this.notify(); }
  setEnabled(enabled: boolean) { this.status.enabled = enabled; this.reset(); this.setMode(enabled ? 'checking' : 'off'); }
  clearSeen() { this.seen.clear(); }
  /** 切换对话面板等宿主权限范围时，取消在途任务，保留同一世界的近期去重缓存。 */
  invalidateScope() {
    this.generation++; this.active?.cancel(); this.cancelActiveTimeout?.(); this.cancelActiveTimeout = undefined;
    this.active = null; this.activeActor = null; this.activeTicket = undefined;
    this.queue.clear(); this.cancelWake?.(); this.cancelWake = undefined; this.seen.clear();
  }
  /**
   * 宿主销毁人物时显式调用；collect 是当前候选集，未出现不代表人物已离开世界。
   * 清除所有人物级状态，使长时间运行、持续刷新名单的游戏不会无限积累旧人物。
   */
  forgetActor(actorId: string) {
    this.seen.delete(actorId); this.cooldown.delete(actorId); this.recent.delete(actorId);
    this.queue.delete(actorId); delete this.status.lines[actorId];
    for (const [key, entry] of this.pool) if (entry.actorId === actorId) this.pool.delete(key);
    if (this.activeActor === actorId) {
      this.generation++; this.active?.cancel(); this.cancelActiveTimeout?.(); this.cancelActiveTimeout = undefined;
      this.active = null; this.activeActor = null;
    }
    this.notify(); this.pump();
  }
  reset(clearStatistics = false) {
    this.invalidateScope(); this.pool.clear(); this.cooldown.clear(); this.recent.clear();
    if (clearStatistics) {
      this.status.generated = 0; this.status.cached = 0; this.status.discarded = 0;
      this.status.failures = 0; this.status.latencyMs = 0;
    }
    this.retryAt = 0; this.status.lines = {}; this.notify();
  }
  dispose() { this.disposed = true; this.reset(); }
  sync() {
    if (this.disposed || this.committing || !this.status.enabled) return;
    if (!this.options.bridge.canRun()) { if (this.active || this.queue.size) this.invalidateScope(); return; }
    for (const [key, entry] of this.pool) if (entry.until <= this.options.clock.now()) this.pool.delete(key);
    for (const candidate of this.options.bridge.collect()) {
      if (this.seen.get(candidate.actorId) === candidate.revision) continue;
      this.seen.set(candidate.actorId, candidate.revision);
      if (this.activeActor === candidate.actorId) {
        if (this.active && this.activeTicket !== undefined
          && this.options.bridge.isCurrent(this.activeTicket, false)
          && this.options.bridge.continuesActive?.(this.activeTicket, candidate.ticket)) continue;
        this.generation++; this.active?.cancel(); this.cancelActiveTimeout?.(); this.cancelActiveTimeout = undefined;
        this.active = null; this.activeActor = null;
      }
      this.queue.delete(candidate.actorId);
      if (!candidate.eligible) continue;
      if (candidate.urgent) { this.cancelWake?.(); this.cancelWake = undefined; }
      const entry = this.pool.get(candidate.key);
      const cached = entry?.actorId === candidate.actorId ? entry.lines.shift() : undefined;
      if (cached && this.deliver(candidate, cached.text, cached.source, true)) {
        if (candidate.allowRefill) this.queue.set(candidate.actorId, { candidate, refill: true, retries: 0 });
      } else if (candidate.urgent || this.options.clock.now() >= (this.cooldown.get(candidate.actorId) ?? 0)) {
        this.queue.set(candidate.actorId, { candidate, refill: false, retries: 0 });
      }
    }
    this.pump();
  }
  private deliver(candidate: DialogueCandidate<TTicket>, text: string, source: DialogueSource, cached = false): boolean {
    if ((this.recent.get(candidate.actorId) ?? []).includes(text) || !this.options.validate(text, candidate.payload)) return false;
    let revision: string | false;
    // 宿主可能同步发布并再次调用 sync；提交期间禁止重入，避免消费自身字幕之前排队。
    this.committing = true;
    try { revision = this.options.bridge.commit(candidate.ticket, text, source); }
    finally { this.committing = false; }
    if (revision === false) return false;
    // 提交期间已阻止同步重入；记录写入后的修订，防止下一帧把本次字幕再次送去生成。
    this.seen.set(candidate.actorId, revision);
    this.recent.set(candidate.actorId, [...(this.recent.get(candidate.actorId) ?? []), text].slice(-5));
    this.status.lines[candidate.actorId] = { text, source };
    if (cached) this.status.cached++; else this.status.generated++;
    this.notify(); return true;
  }
  private pump() {
    if (this.active || this.disposed || !this.status.enabled || !this.options.bridge.canRun()) return;
    const clock = this.options.clock;
    if (clock.now() < this.retryAt) {
      if (!this.cancelWake && this.queue.size) this.cancelWake = clock.schedule(() => {
        this.cancelWake = undefined; this.pump();
      }, Math.max(1, this.retryAt - clock.now()));
      return;
    }
    const job = [...this.queue.values()].sort((a, b) => Number(a.refill) - Number(b.refill)
      || b.candidate.priority - a.candidate.priority)[0];
    if (!job) return;
    const candidate = job.candidate;
    this.queue.delete(candidate.actorId);
    if (!this.options.bridge.isCurrent(candidate.ticket, job.refill)) { this.pump(); return; }
    const cancellation = clock.cancellation(); this.active = cancellation; this.activeActor = candidate.actorId;
    this.activeTicket = candidate.ticket;
    const generation = this.generation;
    const cancelTimeout = clock.schedule(() => {
      if (this.active !== cancellation || this.disposed) return;
      // 取消信号只是建议，第三方 transport 可能永不 settle。期限到达后主动释放逻辑槽，
      // 同时推进代际；迟到结果和它的 finally 都不能提交或清掉下一名人物的任务。
      this.generation++; cancellation.cancel();
      this.active = null; this.activeActor = null; this.cancelActiveTimeout = undefined;
      this.status.failures++; this.status.mode = 'fallback'; this.notify(); this.pump();
    }, this.options.requestTimeoutMs ?? 8000);
    this.cancelActiveTimeout = cancelTimeout;
    const payload: DialoguePayload = { ...candidate.payload,
      requestId: `${generation}:${++this.sequence}:${candidate.actorId}`,
      recentLines: [...new Set([...candidate.payload.recentLines, ...(this.recent.get(candidate.actorId) ?? [])])] };
    this.cooldown.set(candidate.actorId, clock.now() + 4000);
    void this.options.transport(payload, cancellation.signal).then(reply => {
      if (this.disposed || generation !== this.generation || cancellation.signal.aborted) return;
      if (reply.requestId !== payload.requestId || !reply.source || !Number.isFinite(reply.latencyMs)
        || !this.options.validate(reply.text, payload) || payload.recentLines.includes(reply.text)) throw new Error('Invalid or repeated caption');
      this.status.mode = 'ready'; this.status.latencyMs = reply.latencyMs;
      if (job.refill) {
        // 补充缓存也必须再核对心智/世界，不能把已经失效的意图存起来稍后复播。
        if (!this.options.bridge.isCurrent(candidate.ticket, true)) { this.status.discarded++; return; }
        if (!this.pool.has(candidate.key) && this.pool.size >= 24) this.pool.delete(this.pool.keys().next().value!);
        const previous = this.pool.get(candidate.key);
        const entry = previous?.actorId === candidate.actorId ? previous
          : { actorId: candidate.actorId, lines: [], until: clock.now() + 30000 };
        if (!entry.lines.some(line => line.text === reply.text) && entry.lines.length < 2) entry.lines.push({ text: reply.text, source: reply.source });
        this.pool.set(candidate.key, entry);
      } else if (this.deliver(candidate, reply.text, reply.source)) {
        if (candidate.allowRefill) this.queue.set(candidate.actorId, { ...job, refill: true });
      } else this.status.discarded++;
      this.notify();
    }).catch((error: unknown) => {
      if (this.disposed || generation !== this.generation) return;
      const outcome = this.options.classifyError?.(error);
      if (outcome) {
        this.status.discarded++; this.status.mode = 'ready';
        if (outcome === 'busy' && candidate.urgent && job.retries < 2)
          this.queue.set(candidate.actorId, { ...job, retries: job.retries + 1 });
        this.retryAt = clock.now() + 1000 * (job.retries + 1); this.notify(); return;
      }
      this.status.failures++; this.status.mode = 'fallback'; this.retryAt = clock.now() + 10000;
      this.queue.clear(); this.notify();
    }).finally(() => {
      cancelTimeout();
      if (this.active === cancellation) { this.cancelActiveTimeout = undefined; this.active = null; this.activeActor = null; this.activeTicket = undefined; this.pump(); }
    });
  }
}
