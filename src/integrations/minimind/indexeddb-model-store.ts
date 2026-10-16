import type { ModelStore } from './assets';

export const MODEL_DATABASE = 'minimind-verified-models';
const STORE = 'weights';

/** One complete Blob, atomically replacing all older weights in the same transaction. */
export function indexedDBModelStore(url: string, version: string, timeoutMs = 5000): ModelStore {
  const key = `${version}:${url}`;
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error('Model storage open timed out')), timeoutMs);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
    };
    try {
      const request = indexedDB.open(MODEL_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onerror = () => fail(request.error ?? new Error('Model storage open failed'));
      request.onblocked = () => fail(new Error('Model storage open blocked'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true; clearTimeout(timer);
        db.onversionchange = () => db.close();
        resolve(db);
      };
    } catch (error) { fail(error); }
  });
  const transact = async <T>(mode: IDBTransactionMode,
    action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction;
        let value: T;
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (error) reject(error); else resolve(value);
        };
        const timer = setTimeout(() => {
          finish(new Error('Model storage transaction timed out'));
          try { transaction?.abort(); } catch { /* Already finished. */ }
        }, timeoutMs);
        try {
          transaction = db.transaction(STORE, mode);
          transaction.oncomplete = () => finish();
          transaction.onabort = () => finish(transaction.error ?? new Error('Model storage transaction aborted'));
          transaction.onerror = () => finish(transaction.error ?? new Error('Model storage transaction failed'));
          action(transaction.objectStore(STORE), result => { value = result; });
        } catch (error) {
          finish(error);
          try { transaction!.abort(); } catch { /* Transaction may not have started. */ }
        }
      });
    } finally { db.close(); }
  };
  return {
    read: () => transact<Blob | undefined>('readonly', (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => result(request.result instanceof Blob ? request.result : undefined);
    }),
    write: blob => transact<void>('readwrite', store => { store.clear(); store.put(blob, key); }),
    remove: () => transact<void>('readwrite', store => { store.delete(key); }),
  };
}
