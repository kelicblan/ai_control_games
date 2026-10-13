import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, nextRevision, parseInput, parseSettings, validateSettings, type SettingsCatalog } from '../packages/npc-settings/src';
import { createSqliteSettingsRepository, type SqliteDriver } from '../packages/npc-settings/src/sqlite';

const catalog: SettingsCatalog = { gameId: 'restaurant', schemaVersion: 1,
  fields: [{ id: 'cooking', label: '烹饪', description: '厨房工作技能', group: '技能', min: 0, max: 100, step: 1 }],
  characters: [{ id: 'chef', label: '厨师', defaults: { cooking: 50 } }] };
const driver = (db: DatabaseSync): SqliteDriver => ({
  exec: sql => { db.exec(sql); },
  get: (sql, params) => db.prepare(sql).get(...params) as Record<string, unknown> | undefined,
  run: (sql, params) => { db.prepare(sql).run(...params); },
});

describe('可复用角色配置契约', () => {
  it('无需任何营地 ID 就能创建另一款游戏的配置', () => {
    expect(defaultSettings(catalog).characters.chef.cooking).toBe(50);
  });
  it.each([NaN, Infinity, -1, 101, 3.2, '20', null])('拒绝非法数值 %s', value => {
    const document = defaultSettings(catalog);
    (document.characters.chef as Record<string, unknown>).cooking = value;
    expect(() => validateSettings(catalog, document)).toThrow();
  });
  it('拒绝未知字段、角色、未来版本与跨游戏导入', () => {
    const document = defaultSettings(catalog);
    expect(() => validateSettings(catalog, { ...document, schemaVersion: 2 })).toThrow();
    expect(() => validateSettings(catalog, { ...document, gameId: 'another-game' })).toThrow();
    expect(() => validateSettings(catalog, { ...document, characters: { other: { cooking: 20 } } })).toThrow();
    document.characters.chef.unknown = 1;
    expect(() => validateSettings(catalog, document)).toThrow();
    expect(() => parseSettings(catalog, '{broken')).toThrow();
  });
  it('空输入不变成零，显示倍率正确转换，修订号不会溢出', () => {
    expect(() => parseInput(catalog.fields[0], '')).toThrow();
    expect(parseInput({ ...catalog.fields[0], max: 1, step: .01, displayScale: 100 }, '83')).toBe(.83);
    expect(() => nextRevision(Number.MAX_SAFE_INTEGER - 1)).toThrow();
  });
  it('草稿、默认值和校验结果没有共享可变引用', () => {
    const draft = defaultSettings(catalog), clean = validateSettings(catalog, draft);
    draft.characters.chef.cooking = 0;
    expect(clean.characters.chef.cooking).toBe(50);
    expect(catalog.characters[0].defaults.cooking).toBe(50);
  });
});

describe('真实 SQLite 存储合同', () => {
  it('落盘重开、游戏隔离和 CAS 冲突均按同一份合同运行', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'npc-settings-'));
    const file = join(directory, 'settings.sqlite');
    let db = new DatabaseSync(file);
    try {
      let repository = createSqliteSettingsRepository(driver(db), catalog);
      const initial = await repository.load();
      expect(initial.revision).toBe(0);
      initial.document.characters.chef.cooking = 93;
      expect((await repository.save(initial.document, 0)).revision).toBe(1);
      await expect(repository.save(initial.document, 0)).rejects.toMatchObject({ code: 'conflict' });
      const other = createSqliteSettingsRepository(driver(db), { ...catalog, gameId: 'space-station' });
      expect((await other.load()).revision).toBe(0);
      db.close(); db = new DatabaseSync(file);
      repository = createSqliteSettingsRepository(driver(db), catalog);
      expect((await repository.load()).document.characters.chef.cooking).toBe(93);
      expect((await repository.save(initial.document, 1)).revision).toBe(2);
      // 损坏记录不能被 save 的默认回退悄悄抹掉。
      db.prepare('UPDATE npc_settings SET document = ? WHERE game_id = ?').run('{bad', catalog.gameId);
      await expect(repository.load()).rejects.toThrow();
      await expect(repository.save(initial.document, 2)).rejects.toThrow();
      expect(db.prepare('SELECT document FROM npc_settings WHERE game_id = ?').get(catalog.gameId)?.document).toBe('{bad');
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it('写入失败会回滚，不返回虚假的成功修订号', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      const base = driver(db);
      const repository = createSqliteSettingsRepository({ ...base, run: () => { throw new Error('模拟磁盘写入失败'); } }, catalog);
      await expect(repository.save(defaultSettings(catalog), 0)).rejects.toThrow('模拟磁盘写入失败');
      expect((await repository.load()).revision).toBe(0);
      expect((await createSqliteSettingsRepository(base, catalog).save(defaultSettings(catalog), 0)).revision).toBe(1);
    } finally { db.close(); }
  });
});
