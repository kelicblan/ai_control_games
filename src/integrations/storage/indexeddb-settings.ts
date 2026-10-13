import { conflict, defaultSettings, nextRevision, parseSettings, SettingsError, validRevision, validateSettings,
  type SettingsCatalog, type SettingsRepository, type SettingsSnapshot, type NpcSettings } from '../../../packages/npc-settings/src';

/** 浏览器适配器不认识营地。每个 gameId 独立一行，整份配置通过单个事务提交。 */
export function createIndexedDbSettingsRepository(catalog: SettingsCatalog, factory?: IDBFactory): SettingsRepository {
  const defaults = defaultSettings(catalog);
  const databaseName = 'npc-initial-settings-v1';
  const storeName = 'templates';
  const readRow = (row: unknown): SettingsSnapshot => {
    if (row === undefined) return { revision: 0, document: validateSettings(catalog, defaults) };
    if (!row || typeof row !== 'object') throw new SettingsError('storage', '本地角色配置损坏。');
    const value = row as Record<string, unknown>;
    if (value.gameId !== catalog.gameId || !validRevision(value.revision) || value.revision === 0 || typeof value.document !== 'string') {
      throw new SettingsError('storage', '本地角色配置格式或修订号损坏。');
    }
    return { revision: value.revision, document: parseSettings(catalog, value.document) };
  };
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
    const timer = setTimeout(() => fail(new SettingsError('storage', '打开配置数据库超时，请关闭其他旧版页面后重试。')), 5000);
    try {
      const dbFactory = factory ?? globalThis.indexedDB;
      if (!dbFactory) throw new SettingsError('storage', '此环境不支持本地配置数据库。');
      const request = dbFactory.open(databaseName, 1);
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'gameId' });
        } catch (error) { fail(error); request.transaction?.abort(); }
      };
      request.onerror = () => fail(request.error ?? new SettingsError('storage', '无法打开本地配置数据库。'));
      request.onblocked = () => fail(new SettingsError('storage', '配置数据库被其他页面占用，请关闭旧页面再试。'));
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; clearTimeout(timer);
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    } catch (error) { fail(error); }
  });
  const transact = async (document?: NpcSettings, expectedRevision?: number): Promise<SettingsSnapshot> => {
    // 在打开写事务前完成 CPU 校验；事务中不 await，不会被浏览器提前自动提交。
    const clean = document === undefined ? undefined : validateSettings(catalog, document);
    const next = clean ? nextRevision(expectedRevision!) : 0;
    const db = await open();
    return new Promise((resolve, reject) => {
      let result: SettingsSnapshot | undefined;
      let failure: unknown;
      let settled = false;
      let activeTransaction: IDBTransaction | undefined;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timer); db.close();
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new SettingsError('storage', '配置事务没有返回结果。'));
      };
      const timer = setTimeout(() => {
        failure = new SettingsError('storage', '配置操作超时，未确认保存，请重新载入检查。');
        try { activeTransaction?.abort(); } catch { /* 事务可能已结束，仍明确提示未确认结果。 */ }
        finish(failure);
      }, 5000);
      try {
        const transaction = db.transaction(storeName, clean ? 'readwrite' : 'readonly');
        activeTransaction = transaction;
        const store = transaction.objectStore(storeName);
        const request = store.get(catalog.gameId);
        transaction.oncomplete = () => finish();
        transaction.onabort = () => finish(failure ?? transaction.error ?? new SettingsError('storage', '配置未能保存，请检查浏览器存储权限或空间。'));
        transaction.onerror = () => { failure ??= transaction.error; };
        request.onsuccess = () => {
          try {
            const current = readRow(request.result);
            if (!clean) { result = current; return; }
            if (current.revision !== expectedRevision) conflict();
            result = { revision: next, document: clean };
            store.put({ gameId: catalog.gameId, revision: next, document: JSON.stringify(clean) });
          } catch (error) { failure = error; transaction.abort(); }
        };
      } catch (error) { finish(error); }
    });
  };
  return { load: () => transact(), save: (document, revision) => transact(document, revision) };
}
