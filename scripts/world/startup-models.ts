type Status = { stage: string; progress: number | null; error?: string };
type Loader = { prepare(): Promise<void>; status(): Status };
type Job = { modelId: string; miniReady: boolean; preferredReady: boolean; error?: string; pending: boolean };

// The fallback and preferred slots are independent; polling never restarts a load.
export class StartupModels {
  private jobs = new Map<string, Job>();
  constructor(private mini: Loader, private preferred: (player: string, id: string) => Loader) {}
  begin(player: string, modelId: string) {
    const existing = this.jobs.get(player);
    if (existing?.modelId === modelId && existing.pending) return;
    const job: Job = { modelId, miniReady: false, preferredReady: modelId === 'minimind3', pending: true };
    this.jobs.set(player, job);
    const run = async (loader: Loader, key: 'miniReady' | 'preferredReady') => {
      try { await loader.prepare(); job[key] = true; }
      catch (error) { job.error = error instanceof Error ? error.message : '模型加载失败'; }
    };
    void Promise.all([run(this.mini, 'miniReady'), ...(modelId === 'minimind3' ? [] : [run(this.preferred(player, modelId), 'preferredReady')])])
      .then(() => { job.pending = false; });
  }
  snapshot(player: string, modelId: string) {
    const job = this.jobs.get(player);
    if (!job || job.modelId !== modelId) return { stage: 'idle', modelId, progress: 0 };
    const mini = this.mini.status(), preferred = modelId === 'minimind3' ? mini : this.preferred(player, modelId).status();
    const fraction = (ready: boolean, status: Status) => {
      if (ready) return 1;
      const progress = Math.max(0, Math.min(1, status.progress ?? 0));
      return status.stage === 'verify' ? .2 * progress : status.stage === 'initialize' ? .2
        : status.stage === 'load' ? .2 + .75 * progress : status.stage === 'ready' ? .95 : 0;
    };
    return { stage: job.error ? 'error' : job.miniReady && job.preferredReady ? 'ready' : 'loading', modelId,
      progress: modelId === 'minimind3' ? fraction(job.miniReady, mini) : (fraction(job.miniReady, mini) + fraction(job.preferredReady, preferred)) / 2,
      mini: { ...mini, ready: job.miniReady }, preferred: { ...preferred, ready: job.preferredReady }, error: job.error };
  }
}
