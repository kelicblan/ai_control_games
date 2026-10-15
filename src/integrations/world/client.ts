import { SAVE_KEY, restoreGameState } from '../../games/camp/simulation/persistence';
import type { WorldAction, WorldSnapshot } from './types';
import type { Point } from '../../games/camp/simulation/types';
import { shareWorldState } from './snapshotSharing';
import { ensurePlayerSession } from './session';

export const operationId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');

/** Serial mutations; polls never publish across an intervening user operation. */
export class WorldClient {
  readonly owner = operationId();
  snapshot: WorldSnapshot = { state: null, revision: 0, speed: 1, savedAt: 0, recovered: false, temporaryPause: false, catchingUp: false };
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private epoch = 0;
  private disposed = false;
  private polling = false;
  private connected = false;
  private controller = new AbortController();
  private initialized: Promise<void>;
  private lordPending: { direction: Point; at: number } | null = null;
  private lordBusy = false;
  constructor(private publish: (snapshot: WorldSnapshot) => void, private report: (message: string) => void) {
    this.initialized = this.initialize();
    void this.initialized.catch(() => {});
  }
  private async request(body?: unknown): Promise<WorldSnapshot> {
    await ensurePlayerSession();
    const response = await fetch('/game-api/world', { method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Camp-Tab': this.owner, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `存档服务请求失败 (${response.status})`);
    if (!result || typeof result.revision !== 'number' || !('state' in result)) throw new Error('存档服务响应无效');
    return result as WorldSnapshot;
  }
  private accept(snapshot: WorldSnapshot) {
    if (this.disposed) return;
    snapshot = { ...snapshot, state: shareWorldState(this.snapshot.state, snapshot.state) };
    this.snapshot = snapshot; this.publish(snapshot); this.report('');
    this.connected = true;
  }
  private async initialize() {
    try {
      let snapshot = await this.request();
      if (!snapshot.state) {
        // Legacy source is never deleted, including invalid or unsupported saves.
        let legacy = null;
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          if (raw && raw.length <= 1_000_000) {
            const envelope = JSON.parse(raw);
            if (envelope.version === 1) legacy = restoreGameState(envelope.state);
          }
        } catch { /* browser storage can be unavailable */ }
        if (legacy) {
          try { snapshot = await this.request({ revision: 0, operation: operationId(), action: { type: 'import', state: legacy } }); }
          catch (error) {
            snapshot = await this.request();
            if (!snapshot.state) throw new Error(`旧存档迁移失败，原存档已保留：${error instanceof Error ? error.message : '服务未能接收进度'}`);
          }
        }
      }
      this.accept(snapshot);
    } catch (error) {
      if (!this.disposed) this.report(error instanceof Error ? error.message : '无法读取数据库存档');
      throw error;
    }
  }
  async poll() {
    if (this.pending || this.disposed || this.polling) return;
    this.polling = true;
    const epoch = this.epoch;
    try {
      await this.initialized.catch(() => {});
      if (!this.connected) { await this.initialize(); return; }
      const snapshot = await this.request();
      if (epoch === this.epoch) this.accept(snapshot);
    } catch (error) { if (!this.disposed) this.report(error instanceof Error ? error.message : '存档服务连接中断'); }
    finally { this.polling = false; }
  }
  mutate(action: WorldAction): Promise<WorldSnapshot> {
    if(action.type==='pause'||action.type==='start'||action.type==='import'||action.type==='reset') this.lordPending=null;
    this.pending++; this.epoch++;
    const operation = operationId();
    const task = this.queue.then(async () => {
      await this.initialized.catch(() => {});
      const request = { revision: this.snapshot.revision, operation, action };
      // Retry the same UUID once if transport fails after commit; never repeat effects.
      let snapshot: WorldSnapshot;
      try { snapshot = await this.request(request); }
      catch (error) {
        if (error instanceof TypeError || error instanceof DOMException && error.name === 'TimeoutError') snapshot = await this.request(request);
        else throw error;
      }
      this.accept(snapshot); return snapshot;
    });
    this.queue = task.catch(async error => {
      if (!this.disposed) {
        try { this.accept(await this.request()); } catch { /* retain last visible world */ }
        this.report(error instanceof Error ? error.message : '操作未能保存');
      }
    }).finally(() => { this.pending--; });
    return task;
  }
  /** One request plus one latest unsent intent; movement cannot fill the durable command queue. */
  sendLordInput(direction: Point): void {
    if(this.disposed)return;
    this.lordPending={direction:{...direction},at:Date.now()};
    if(this.lordBusy)return;
    this.lordBusy=true;this.pending++;this.epoch++;
    const task=this.queue.then(async()=>{
      await this.initialized.catch(()=>{});
      const input=this.lordPending;this.lordPending=null;
      if(!input||this.disposed)return;
      const direction=Date.now()-input.at>300||this.snapshot.state?.status!=='playing'?{x:0,y:0}:input.direction;
      // Never retry a motion renewal: a delayed retry could revive released controls.
      const snapshot=await this.request({revision:this.snapshot.revision,operation:operationId(),action:{type:'command',command:{type:'lord-input',playerId:'local-player',direction}}});
      this.accept(snapshot);
    });
    this.queue=task.catch(async error=>{
      if(!this.disposed){
        try { this.accept(await this.request()); } catch { /* The short server lease still stops motion. */ }
        this.report(error instanceof Error?error.message:'领主控制连接中断');
      }
    }).finally(()=>{
      this.pending--;this.lordBusy=false;
      const latest=this.lordPending;
      if(latest&&!this.disposed){this.lordPending=null;this.sendLordInput(Date.now()-latest.at>300?{x:0,y:0}:latest.direction);}
    });
  }
  dispose() { this.disposed = true; this.lordPending=null; this.controller.abort(); }
}
