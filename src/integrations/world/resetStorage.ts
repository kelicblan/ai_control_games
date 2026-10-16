import { SAVE_KEY } from '../../games/camp/simulation/persistence';

/** Only runtime records: model choice, model assets and NPC templates survive. */
export function clearRuntimeStorage(storage: Storage = globalThis.localStorage): void {
  const keys = [SAVE_KEY];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith('campmind.camera.v1:')) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
