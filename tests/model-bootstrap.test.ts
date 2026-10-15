import { expect, it, vi } from 'vitest';
const { prepare, catalog } = vi.hoisted(() => ({ prepare: vi.fn(async () => {}), catalog: vi.fn(async () => { throw new Error('native host unavailable'); }) }));
vi.mock('../src/integrations/minimind/runtime', () => ({ minimindRuntime: { subscribe: vi.fn(() => () => {}), prepare, generate: vi.fn(), unload: vi.fn() } }));
vi.mock('../src/integrations/models/native', () => ({ NativeRuntime: class {}, nativeCatalog: catalog }));
import { bootstrapModels, modelManager } from '../src/integrations/models/runtime';
it('starts MiniMind once even when native catalog discovery fails before any scene opens', async () => {
  await Promise.all([bootstrapModels(), bootstrapModels()]);
  expect(prepare).toHaveBeenCalledOnce(); expect(catalog).toHaveBeenCalledOnce();
  expect(modelManager.snapshot()).toMatchObject({ activeId: 'minimind3', mini: { stage: 'ready' } }); modelManager.dispose();
});
