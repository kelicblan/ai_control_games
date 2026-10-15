import { describe, expect, it } from 'vitest';
import { clearRuntimeStorage } from '../src/integrations/world/resetStorage';
import { SAVE_KEY } from '../src/games/camp/simulation/persistence';

describe('reset browser runtime records', () => {
  it('clears all old game/camera records while preserving settings and unrelated data', () => {
    const values = new Map([[SAVE_KEY, 'old-save'], ['campmind.camera.v1:17', 'old-view'],
      ['campmind.camera.v1:64138', 'old-view'], ['campmind-dialogue-model-v1', 'minimind3'], ['other-app', 'keep']]);
    const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); } } as Storage;
    clearRuntimeStorage(storage);
    expect([...values.entries()]).toEqual([['campmind-dialogue-model-v1', 'minimind3'], ['other-app', 'keep']]);
  });
  it('does not silently report completion when browser deletion is blocked', () => {
    expect(() => clearRuntimeStorage({ length: 0, removeItem() { throw new Error('blocked'); } } as unknown as Storage)).toThrow('blocked');
  });
});
