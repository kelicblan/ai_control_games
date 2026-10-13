import { conflict, defaultSettings, nextRevision, parseSettings, SettingsError, validateSettings, validRevision,
  type NpcSettings, type SettingsCatalog, type SettingsRepository, type SettingsSnapshot } from './index';

/**
 * 宿主注入同步 SQLite 连接，不绑定 node:sqlite、better-sqlite3 或特定原生引擎。
 * run/get 的参数必须以占位符绑定，禁止驱动把参数拼接到 SQL。
 * 连接生命周期、加密、备份和日志模式由宿主负责；此适配器不关闭外部连接。
 */
export interface SqliteDriver {
  exec(sql: string): void;
  get(sql: string, params: readonly (string | number)[]): Record<string, unknown> | undefined;
  run(sql: string, params: readonly (string | number)[]): void;
}
export function createSqliteSettingsRepository(driver: SqliteDriver, catalog: SettingsCatalog): SettingsRepository {
  const defaults = defaultSettings(catalog);
  driver.exec('CREATE TABLE IF NOT EXISTS npc_settings (game_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), document TEXT NOT NULL)');
  const read = (): SettingsSnapshot => {
    const row = driver.get('SELECT revision, document FROM npc_settings WHERE game_id = ?', [catalog.gameId]);
    if (!row) return { revision: 0, document: validateSettings(catalog, defaults) };
    if (!validRevision(row.revision) || row.revision === 0 || typeof row.document !== 'string') throw new SettingsError('storage', 'SQLite 配置记录已损坏。');
    return { revision: row.revision, document: parseSettings(catalog, row.document) };
  };
  return {
    async load() { return read(); },
    async save(document: NpcSettings, expectedRevision: number) {
      const clean = validateSettings(catalog, document);
      const revision = nextRevision(expectedRevision);
      // 锁与读写在同一个同步事务中，不能把 await 插进事务中间。
      driver.exec('BEGIN IMMEDIATE');
      try {
        if (read().revision !== expectedRevision) conflict();
        driver.run('INSERT INTO npc_settings(game_id, revision, document) VALUES (?, ?, ?) ON CONFLICT(game_id) DO UPDATE SET revision=excluded.revision, document=excluded.document',
          [catalog.gameId, revision, JSON.stringify(clean)]);
        driver.exec('COMMIT');
        return { revision, document: clean };
      } catch (error) {
        try { driver.exec('ROLLBACK'); } catch { /* 回滚失败不能遮蔽最初的保存错误。 */ }
        throw error;
      }
    },
  };
}
