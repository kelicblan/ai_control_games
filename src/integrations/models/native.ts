import type { DialoguePayload } from '../../../packages/npc-dialogue/src/types';
import { cleanDialogueText } from '../../../packages/npc-dialogue/src/prompt';
import { DialogueRequestError } from '../minimind/protocol';
import type { ModelDescriptor, ModelRuntime } from './manager';

export async function hostRequest(route: string, body?: unknown, signal?: AbortSignal) {
  let response: Response;
  const endpoint = `${import.meta.env.BASE_URL}model-api/${route}`;
  // Initial scene/model setup can delay browser response handling. Read-only
  // discovery has the same budget as remote metadata; mutations remain bounded.
  const timeout = AbortSignal.timeout(route === 'models' ? 60000 : route === 'remote' ? 6000 : 5000);
  try { response = await fetch(endpoint, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Campmind-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout }); }
  catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted || error instanceof Error && error.name === 'TimeoutError') throw new Error(`模型接口请求超时：${endpoint}。请检查游戏服务及域名转发是否正常。`);
    throw new Error(`模型接口连接失败：${endpoint}。请检查游戏服务及域名转发是否正常。`);
  }
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error(`模型接口未返回有效数据：${endpoint}（HTTP ${response.status}）。请检查该路径是否转发到游戏服务。`);
  let result;
  try { result = await response.json(); } catch { throw new Error(`模型接口响应无法解析：${endpoint}（HTTP ${response.status}）。`); }
  if (!response.ok) {
    if (result.outcome === 'busy' || result.outcome === 'skipped') throw new DialogueRequestError(response.status, result.outcome, result.error);
    throw new Error(result.error ?? `模型接口请求失败：${endpoint}（HTTP ${response.status}）。`);
  }
  return result;
}
export async function nativeCatalog(): Promise<ModelDescriptor[]> { return (await hostRequest('models')).models; }
function createOwnerToken(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // getRandomValues also works in non-secure HTTP contexts used for LAN development.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export class NativeRuntime implements ModelRuntime {
  private operation?: number;
  private monitor?: ReturnType<typeof setInterval>;
  private monitoring = false;
  private owner = createOwnerToken();
  constructor(private id: string) {}
  async prepare(report: Parameters<ModelRuntime['prepare']>[0], signal: AbortSignal) {
    try { await this.load(report, signal); }
    catch (error) { await this.unload(); throw error; }
  }
  private async load(report: Parameters<ModelRuntime['prepare']>[0], signal: AbortSignal) {
    const result = await hostRequest('select', { id: this.id, token: this.owner }, signal); this.operation = result.operation;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      signal.throwIfAborted(); const state = await hostRequest('status', undefined, signal);
      if (state.operation !== this.operation || state.id !== this.id) throw new DOMException('模型已在其他页面切换', 'AbortError');
      report({ stage: state.stage, progress: state.progress, cached: result.reused === true });
      if (state.stage === 'ready') { this.watch(report, signal); return; }
      if (state.stage === 'error') throw new Error(state.error);
      await new Promise<void>((resolve, reject) => {
        const done = () => { signal.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(done, 150);
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
        signal.addEventListener('abort', abort, { once: true });
      });
    }
    throw new Error('原生模型加载超时');
  }
  private watch(report: Parameters<ModelRuntime['prepare']>[0], signal: AbortSignal) {
    clearInterval(this.monitor);
    this.monitor = setInterval(() => {
      if (signal.aborted) { clearInterval(this.monitor); return; }
      if (this.monitoring) return;
      this.monitoring = true;
      void hostRequest('status').then(state => {
        if (signal.aborted) return;
        if (state.id !== this.id || state.operation !== this.operation) {
          clearInterval(this.monitor); report({ stage: 'cancelled', progress: null, error: '模型已在其他页面切换，请重新选择优先模型' }); return;
        }
        if (state.stage !== 'ready') throw new Error(state.error ?? '原生模型已卸载');
      }).catch(error => {
        clearInterval(this.monitor);
        if (!signal.aborted) report({ stage: 'error', progress: null, error: error instanceof Error ? error.message : '原生服务已退出' });
      }).finally(() => { this.monitoring = false; });
    }, 2000);
  }
  async generate(payload: DialoguePayload, signal: AbortSignal) {
    const result = await hostRequest('generate', { id: this.id, operation: this.operation, prompt: payload.prompt }, signal);
    const text = cleanDialogueText(result.content);
    if (!text) throw new DialogueRequestError(0, 'skipped', '保留即时反馈');
    return { requestId: payload.requestId, text, source: `native:${this.id}`, latencyMs: result.latencyMs };
  }
  async unload() { clearInterval(this.monitor); await hostRequest('unload', { id: this.id, token: this.owner, ...(this.operation === undefined ? {} : { operation: this.operation }) }).catch(() => {}); }
}
