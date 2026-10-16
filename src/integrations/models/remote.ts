import type { DialoguePayload } from '../../../packages/npc-dialogue/src/types';
import { cleanDialogueText } from '../../../packages/npc-dialogue/src/prompt';
import { validateRemote, type RemoteConfig } from '../../shared/remote-model';
import type { ModelDescriptor, ModelRuntime } from './manager';
import { ensurePlayerSession } from '../world/session';
export type { RemoteConfig } from '../../shared/remote-model';

export class RemoteModels {
  private configs: RemoteConfig[] = [];
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  list() { return this.configs.map(c => ({ ...c })); }
  catalog(): ModelDescriptor[] { return this.configs.map(c => ({ id: c.id, name: c.name, backend: 'remote', available: true })); }
  private async request(route: string, body?: unknown, signal?: AbortSignal) {
    await ensurePlayerSession(); signal?.throwIfAborted();
    // Metadata discovery can overlap the initial 3D scene construction on slow CPUs.
    const testing = route === '/test' || route === '/generate' && (body as { test?: boolean })?.test;
    const timeout = AbortSignal.timeout(body === undefined ? 60000 : testing ? 25000 : route === '/generate' ? 32000 : 10000);
    const response = await fetch(`/game-api/remote-models${route}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Camp-Tab': 'remote-models', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `远程模型服务异常 (${response.status})`);
    return result;
  }
  private accept(result: { models: RemoteConfig[] }) {
    if (!Array.isArray(result.models)) throw new Error('远程模型配置响应无效');
    this.configs = result.models.map(c => ({ ...validateRemote(c), hasKey: c.hasKey === true }));
    this.listeners.forEach(listener => listener());
  }
  async refresh() { this.accept(await this.request('')); }
  async save(value: RemoteConfig, apiKey?: string) {
    const config = validateRemote(value);
    this.accept(await this.request('', { action: 'save', config, ...(apiKey === undefined ? {} : { apiKey }) }));
  }
  async remove(id: string) { this.accept(await this.request('', { action: 'delete', id })); }
  test(config: RemoteConfig, apiKey: string | undefined, signal: AbortSignal) {
    return this.request('/test', { config: validateRemote(config), ...(apiKey === undefined ? {} : { apiKey }) }, signal);
  }
  generate(id: string, prompt: string, signal: AbortSignal, test = false) {
    return this.request('/generate', { id, prompt, test }, signal);
  }
}
export class RemoteRuntime implements ModelRuntime {
  private controller = new AbortController();
  constructor(private id: string, private configs: RemoteModels) {}
  private async request(prompt: string, signal: AbortSignal, test = false) {
    const result = await this.configs.generate(this.id, prompt, AbortSignal.any([signal, this.controller.signal]), test);
    if (typeof result.content !== 'string') throw new Error('远程模型未返回有效文本');
    return result;
  }
  async prepare(report: Parameters<ModelRuntime['prepare']>[0], signal: AbortSignal) {
    report({ stage: 'initialize', progress: null }); await this.request('请只回复：准备好了。', signal, true);
    signal.throwIfAborted(); report({ stage: 'ready', progress: 1 });
  }
  async generate(payload: DialoguePayload, signal: AbortSignal) {
    const result = await this.request(payload.prompt ?? '', signal);
    const text = cleanDialogueText(result.content);
    if (!text) throw new Error('远程模型未返回有效台词');
    return { requestId: payload.requestId, text, source: `remote:${this.id}`, latencyMs: result.latencyMs };
  }
  unload() { this.controller.abort(); }
}
