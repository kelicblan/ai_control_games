import { describe, expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { createNpc } from '../src/games/camp/simulation/constants';
import { isValidGameState, loadGameWithStatus, saveGame, SAVE_KEY, type SaveStorage } from '../src/games/camp/simulation/persistence';

function storage(): SaveStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
function raw(target: SaveStorage, state: unknown) {
  target.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 1, state }));
}

describe('NPC 心智存档与旧人物配置迁移', () => {
  it('将旧五人存档更新为当前人物设定，保留身体、财产和真实历史', () => {
    const before = createGame({ seed: 43 });
    before.status = 'paused'; before.elapsed = 20;
    for (const person of before.npcs) { Reflect.deleteProperty(person, 'mind'); Reflect.deleteProperty(person, 'actionEffort'); }
    const zhou = before.npcs.find(npc => npc.id === 'laozhou')!;
    const feng = before.npcs.find(npc => npc.id === 'linlan')!;
    zhou.role = '可靠的热心人'; zhou.personality = { bravery: .56, diligence: .65, empathy: .96 };
    feng.name = '林岚'; feng.role = '公正的协调者'; feng.energy = 31; feng.refusals = 9;
    before.events.push({ id: before.nextEventId++, time: 19, kind: 'info', text: '玩家说：林岚，先回营。', npcId: 'linlan' });
    const target = storage(); raw(target, before);
    const result = loadGameWithStatus(target);
    expect(result.status).toBe('restored');
    const restored = result.state!;
    const updated = restored.npcs.find(npc => npc.id === 'linlan')!;
    expect(updated.name).toBe('林枫');
    expect(updated.energy).toBe(31); expect(updated.refusals).toBe(9);
    expect(restored.npcs.find(npc => npc.id === 'laozhou')!.personality).toEqual(createNpc('laozhou').personality);
    expect(restored.events).toEqual(before.events);
    expect([restored.wood, restored.food, restored.stats]).toEqual([before.wood, before.food, before.stats]);
    const mind = updated.mind!;
    expect(mind).toBeDefined();
    // 累计拒绝次数不是“同一次休息诉求被拒绝”的证据，不得伪造记仇历史。
    expect(mind.memories).toEqual([]); expect(mind.concerns).toEqual([]);
  });

  it('新心智、当前投入和已发出诉求标记往返保存，不能读档洗掉不满', () => {
    const state = createGame({ seed: 12 }); state.status = 'paused'; state.elapsed = 20;
    const npc = state.npcs[0]; const mind = npc.mind!;
    expect(mind).toBeDefined();
    mind.updatedAt = 20; mind.emotions.anger = .75; mind.emotions.resentment = .68;
    mind.intent = { kind: 'refuse', actionId: 'rest', since: 18, until: 28, reason: '连续拒绝后自主休息' };
    Reflect.set(npc, 'actionEffort', .4);
    Reflect.set(state.social.people[npc.id], 'lastConcernPrompts', { rest: 1 });
    const target = storage();
    expect(saveGame(state, target)).toBe(true);
    const restored = loadGameWithStatus(target);
    expect(restored.status).toBe('restored');
    expect(restored.state!.npcs[0]).toEqual(npc);
    expect(restored.state!.social.people[npc.id]).toEqual(state.social.people[npc.id]);
  });

  it('拒绝错绑角色、未来事件游标和非法投入，不覆盖上一份正常存档', () => {
    const state = createGame(); const target = storage();
    expect(saveGame(state, target)).toBe(true);
    const good = target.getItem(SAVE_KEY);
    const malformed = structuredClone(state);
    const mind = malformed.npcs[0].mind!; expect(mind).toBeDefined();
    mind.npcId = 'some-other-character';
    expect(saveGame(malformed, target)).toBe(false);
    expect(target.getItem(SAVE_KEY)).toBe(good);
    mind.npcId = malformed.npcs[0].id; mind.lastEventSequence = state.social.nextId + 100;
    expect(isValidGameState(malformed)).toBe(false);
    mind.lastEventSequence = 0; Reflect.set(malformed.npcs[0], 'actionEffort', 2);
    expect(isValidGameState(malformed)).toBe(false);
  });

  it('未知未来心智版本保留原始存档，避免误判损坏后删除', () => {
    const state = createGame(); const mind = state.npcs[0].mind!; expect(mind).toBeDefined();
    Reflect.set(mind, 'version', 2);
    const target = storage(); raw(target, state); const before = target.getItem(SAVE_KEY);
    expect(loadGameWithStatus(target).status).toBe('unsupported');
    expect(target.getItem(SAVE_KEY)).toBe(before);
  });
});
