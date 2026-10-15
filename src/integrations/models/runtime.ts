import { minimindRuntime } from '../minimind/runtime';
import { ModelManager, type ModelRuntime } from './manager';
import { NativeRuntime, nativeCatalog } from './native';
import { RemoteModels, RemoteRuntime } from './remote';
import { MINI_MODEL } from './manager';

let stopMiniProgress: (() => void) | undefined;
const mini: ModelRuntime = {
  async prepare(report, signal) {
    stopMiniProgress?.(); stopMiniProgress = minimindRuntime.subscribe(value => report(value));
    signal.throwIfAborted(); await minimindRuntime.prepare(); signal.throwIfAborted();
  },
  generate: (payload, signal) => minimindRuntime.generate(payload, signal),
  unload() { stopMiniProgress?.(); stopMiniProgress = undefined; minimindRuntime.unload(); },
};
let storage: Storage | undefined;
try { storage = globalThis.localStorage; } catch {}
export const remoteModels = new RemoteModels();
let localModels: Awaited<ReturnType<typeof nativeCatalog>> = [];
export const modelManager = new ModelManager({ mini, native: id => new NativeRuntime(id), remote: id => new RemoteRuntime(id, remoteModels), storage, models: remoteModels.catalog() });
export function syncModelCatalog() { modelManager.setCatalog([...localModels, ...remoteModels.catalog()]); }
export const refreshModelCatalog = async () => {
  try {
    const results = await Promise.allSettled([nativeCatalog().then(models => { localModels = models; syncModelCatalog(); }), remoteModels.refresh()]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  finally { syncModelCatalog(); }
};
let bootstrap: Promise<void> | undefined;
export function bootstrapModels() {
  if (!bootstrap) {
    // 缓存/推理准备独立于本机宿主发现，也不等待场景和新局。
    const preparingMini = modelManager.prepareMini();
    bootstrap = Promise.all([preparingMini, refreshModelCatalog().catch(() => {}).then(() => modelManager.prepare())]).then(() => {});
  }
  return bootstrap;
}
export async function prepareModels(force = false) {
  await bootstrapModels();
  await modelManager.prepare(force);
}
export function modelName(id: string) { return id === MINI_MODEL.id ? MINI_MODEL.name : modelManager.catalog().find(model => model.id === id)?.name ?? id; }
export function dialogueSourceName(source: string) {
  if(source==='safety')return '安全兜底';
  if (source.startsWith('native:') || source.startsWith('remote:')) return modelName(source.slice(7));
  return ({ template: '即时回应', minimind3: 'MiniMind3', cache: '模型缓存', player: '你' } as Record<string, string>)[source] ?? source;
}
