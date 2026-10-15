import { expect, it, vi } from 'vitest';
const f = vi.hoisted(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'remote-saved', setItem() {} });
  let release!: () => void;
  const catalog = new Promise<void>(resolve => { release = resolve; });
  return { catalog, release, remotePrepare: vi.fn(async () => {}) };
});
vi.mock('../src/integrations/minimind/runtime', () => ({ minimindRuntime: { subscribe: () => () => {}, prepare: async () => {}, generate() {}, unload() {} } }));
vi.mock('../src/integrations/models/native', () => ({ NativeRuntime: class {}, nativeCatalog: async () => [] }));
vi.mock('../src/integrations/models/remote', () => ({
  RemoteModels: class { loaded = false; async refresh() { await f.catalog; this.loaded = true; } catalog() { return this.loaded ? [{ id: 'remote-saved', name: 'Saved', backend: 'remote' }] : []; } },
  RemoteRuntime: class { prepare = f.remotePrepare; unload() {} },
}));
import { modelManager, prepareModels } from '../src/integrations/models/runtime';
it('waits for persisted remote catalog before restoring the preferred model during dialogue startup', async () => {
  const starting = prepareModels();
  await Promise.resolve(); expect(modelManager.snapshot().preferred.stage).toBe('idle');
  f.release(); await starting;
  expect(f.remotePrepare).toHaveBeenCalledOnce();
  expect(modelManager.snapshot()).toMatchObject({ activeId: 'remote-saved', preferred: { stage: 'ready' } });
  modelManager.dispose(); vi.unstubAllGlobals();
});
