import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createGame } from '../src/games/camp/simulation/engine';
import { NPC_IDS, type GameState } from '../src/games/camp/simulation/types';
import { isValidGameState, restoreGameState } from '../src/games/camp/simulation/persistence';
import { CAMP_SETTINGS_CATALOG } from '../src/games/camp/settings/catalog';
import { parseCampStoredSettings } from '../src/games/camp/settings/repository';
import { defaultSettings, parseSettings } from '../packages/npc-settings/src';
import { createSqliteSettingsRepository, type SqliteDriver } from '../packages/npc-settings/src/sqlite';
import { createIndexedDbSettingsRepository } from '../src/integrations/storage/indexeddb-settings';

const FIVE = ['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye'];
const THREE = FIVE.slice(0, 3);
const oldCatalog = { ...CAMP_SETTINGS_CATALOG,
  characters: CAMP_SETTINGS_CATALOG.characters.filter(person => FIVE.includes(person.id)) };

function fiveSave(): GameState {
  const settings = defaultSettings(CAMP_SETTINGS_CATALOG);
  for (const id of FIVE) settings.characters[id]['body.energy'] = 37;
  const state = createGame({ seed: 7315, npcSettings: settings });
  state.npcs = state.npcs.filter(npc => FIVE.includes(npc.id));
  for (const id of NPC_IDS) if (!FIVE.includes(id)) delete (state.social.people as Partial<typeof state.social.people>)[id];
  state.social.relationships = state.social.relationships.filter(pair => FIVE.includes(pair.from) && FIVE.includes(pair.to));
  state.social.relationships[0].affinity = 23;
  state.social.people.azhuang.workload = 41;
  state.social.people.azhuang.resentment = 18;
  state.npcs[0].health = 61;
  state.npcs[0].mind!.emotions.resentment = .37;
  state.social.nextId = 8;
  state.social.nextLineId = 2;
  state.social.revision = 19;
  state.social.stats.kept = 4;
  state.social.threads = [{ id: 1, kind: 'fairness', initiator: 'linlan', participants: ['linlan', 'aye'],
    title: '轮班', prompt: '一起轮班', createdAt: 0, expiresAt: 30, status: 'open', revision: 1,
    lines: [{ id: 1, speaker: 'linlan', text: '说好的轮班。', at: 0, source: 'template' }], choiceId: null, resolution: '' }];
  state.social.memories = [{ id: 3, npcId: 'aye', otherId: 'linlan', threadId: 2, at: 0, kind: 'agreement', text: '答应轮班。' }];
  state.social.promises = [{ id: 4, npcId: 'azhuang', threadId: 2, kind: 'rest', createdAt: 0, dueAt: 30, status: 'pending', fulfilledAt: null }];
  state.social.agreements = [{ id: 5, npcId: 'aye', threadId: 1, action: 'food', createdAt: 0, until: 30 }];
  return state;
}

describe('nine-villager historical saves', () => {
  it('preserves five NPC snapshots and all social history, appending only new people and edges', () => {
    const old = fiveSave();
    const raw = structuredClone(old);
    const restored = restoreGameState(old)!;
    expect(restored).not.toBeNull();
    expect(restored.npcs.map(npc => npc.id)).toEqual(NPC_IDS);
    expect(restored.npcs.slice(0, 5)).toEqual(old.npcs);
    expect(restored.events).toEqual(old.events);
    expect(restored.decisions).toEqual(old.decisions);
    for (const key of ['threads', 'memories', 'promises', 'agreements', 'stats', 'revision', 'nextId', 'nextLineId'] as const) {
      expect(restored.social[key]).toEqual(old.social[key]);
    }
    expect(restored.social.relationships.slice(0, 20)).toEqual(old.social.relationships);
    expect(restored.social.people.azhuang).toEqual(old.social.people.azhuang);
    expect(restored.social.relationships).toHaveLength(72);
    expect(isValidGameState(restored)).toBe(true);
    expect(restoreGameState(restored)).toEqual(restored);
    expect(old).toEqual(raw);
  });

  it.each(['weather3', 'legacy3'])('expands the supported %s roster without resetting old body/mind/settings', schema => {
    const old = fiveSave();
    old.npcs = old.npcs.filter(npc => THREE.includes(npc.id));
    old.npcs[0].mind!.lastEventSequence = 3;
    Reflect.deleteProperty(old, 'social');
    if (schema === 'legacy3') {
      Reflect.deleteProperty(old, 'atmosphere'); Reflect.deleteProperty(old, 'shelterIntegrity');
      for (const npc of old.npcs) Reflect.deleteProperty(npc, 'wetness');
    }
    const restored = restoreGameState(old)!;
    expect(restored).not.toBeNull();
    expect(restored.npcs).toHaveLength(9);
    for (const previous of old.npcs) {
      const npc = restored.npcs.find(person => person.id === previous.id)!;
      expect(npc.health).toBe(previous.health);
      expect(npc.energy).toBe(previous.energy);
      expect(npc.mind).toEqual(previous.mind);
      expect(npc.initialSettings).toEqual(previous.initialSettings);
    }
    expect(isValidGameState(restored)).toBe(true);
    expect(restored.social.nextId).toBe(4);
    expect(restoreGameState(restored)).toEqual(restored);
  });

  it('rejects arbitrary eight-person and incomplete five-person social saves', () => {
    const eight = createGame({ seed: 7315 }); eight.npcs.pop();
    expect(restoreGameState(eight)).toBeNull();
    const broken = fiveSave(); delete (broken.social.people as Partial<typeof broken.social.people>).aye;
    expect(restoreGameState(broken)).toBeNull();
    const wrong = fiveSave(); wrong.npcs[4] = createGame({ seed: 7315 }).npcs[5];
    expect(restoreGameState(wrong)).toBeNull();
  });
});

describe('historical five-person initial settings', () => {
  it('retains every old value, defaults only newcomers, and keeps the generic parser strict', () => {
    const old = defaultSettings(oldCatalog);
    for (const id of FIVE) { old.characters[id]['body.energy'] = 31; old.characters[id]['trait.diligence'] = .13; }
    const text = JSON.stringify(old);
    expect(() => parseSettings(CAMP_SETTINGS_CATALOG, text)).toThrow();
    const expanded = parseCampStoredSettings(text);
    for (const id of FIVE) expect(expanded.characters[id]).toEqual(old.characters[id]);
    for (const person of CAMP_SETTINGS_CATALOG.characters.filter(person => !FIVE.includes(person.id))) {
      expect(expanded.characters[person.id]).toEqual(person.defaults);
    }
    expect(parseCampStoredSettings(JSON.stringify(expanded))).toEqual(expanded);
    const missing = structuredClone(expanded); delete missing.characters.shenyan;
    expect(() => parseCampStoredSettings(JSON.stringify(missing))).toThrow();
    old.characters.azhuang['body.energy'] = 101;
    expect(() => parseCampStoredSettings(JSON.stringify(old))).toThrow();
  });

  it('loads old SQLite documents at the same revision, then saves all nine atomically', async () => {
    const db = new DatabaseSync(':memory:');
    const driver: SqliteDriver = { exec: sql => { db.exec(sql); },
      get: (sql, params) => db.prepare(sql).get(...params) as Record<string, unknown> | undefined,
      run: (sql, params) => { db.prepare(sql).run(...params); } };
    try {
      const old = defaultSettings(oldCatalog); old.characters.xiaomi['body.energy'] = 29;
      await createSqliteSettingsRepository(driver, oldCatalog).save(old, 0);
      const repository = createSqliteSettingsRepository(driver, CAMP_SETTINGS_CATALOG, parseCampStoredSettings);
      const loaded = await repository.load();
      expect(loaded.revision).toBe(1);
      expect(loaded.document.characters.xiaomi).toEqual(old.characters.xiaomi);
      expect(Object.keys(loaded.document.characters)).toHaveLength(9);
      expect((await repository.save(loaded.document, 1)).revision).toBe(2);
      expect((await createSqliteSettingsRepository(driver, CAMP_SETTINGS_CATALOG).load()).document).toEqual(loaded.document);
    } finally { db.close(); }
  });

  it('migrates the raw IndexedDB row during both load and save CAS reads without changing its revision', async () => {
    const old = defaultSettings(oldCatalog); old.characters.linlan['body.energy'] = 17;
    let row = { gameId: CAMP_SETTINGS_CATALOG.gameId, revision: 7, document: JSON.stringify(old) };
    const factory = { open() {
      const request = { result: { close() {}, transaction() {
        const transaction = { objectStore() { return { get() {
          const get = { result: structuredClone(row) } as unknown as IDBRequest;
          queueMicrotask(() => { get.onsuccess?.({} as Event); transaction.oncomplete?.({} as Event); });
          return get;
        }, put(value: typeof row) { row = structuredClone(value); } }; },
        abort() { transaction.onabort?.({} as Event); }, oncomplete: null, onabort: null } as unknown as IDBTransaction;
        return transaction;
      } } } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.({} as Event)); return request;
    } } as unknown as IDBFactory;
    const repository = createIndexedDbSettingsRepository(CAMP_SETTINGS_CATALOG, factory, parseCampStoredSettings);
    const loaded = await repository.load();
    expect(loaded.revision).toBe(7);
    expect(row.revision).toBe(7);
    expect(loaded.document.characters.linlan).toEqual(old.characters.linlan);
    const saved = await repository.save(loaded.document, 7);
    expect(saved.revision).toBe(8);
    expect(parseSettings(CAMP_SETTINGS_CATALOG, row.document)).toEqual(loaded.document);
  });
});
