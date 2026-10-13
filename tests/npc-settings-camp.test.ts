import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../packages/npc-settings/src';
import { CAMP_SETTINGS_CATALOG } from '../src/games/camp/settings/catalog';
import { applyCampInitialSettings, campSkillMultiplier, isValidCampInitialSettings } from '../src/games/camp/settings/runtime';
import { CAMP_PROFILES, getCampProfile } from '../src/games/camp/npc/profiles';
import { refreshCampMind, recordMindEvent } from '../src/games/camp/npc/bridge';
import { createDialogueTicket } from '../src/games/camp/dialogue/context';
import { createGame, advanceGame } from '../src/games/camp/simulation/engine';
import { saveGame, loadGame, loadGameWithStatus, SAVE_KEY } from '../src/games/camp/simulation/persistence';
import { ACTIONS, type PolicyFunction } from '../src/games/camp/simulation/types';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import { projectToWalkable } from '../src/games/camp/simulation/physics';

const storage = () => {
  const records = new Map<string, string>();
  return { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
};
const campPolicy: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0, scores: ACTIONS.map(action => Number(action === 'camp')) });

describe('营地初始模板与本局状态隔离', () => {
  it('未配置与保存全默认配置的开局逐字段相同', () => {
    expect(createGame({ npcSettings: defaultSettings(CAMP_SETTINGS_CATALOG) })).toEqual(createGame());
  });
  it('只修改目标角色；体力修改不偷改原 MLP 人格', () => {
    const defaults = createGame();
    const document = defaultSettings(CAMP_SETTINGS_CATALOG);
    document.characters.azhuang['body.energy'] = 41;
    const state = createGame({ npcSettings: document });
    expect(state.npcs[0].energy).toBe(41);
    expect(state.npcs[0].personality).toEqual(defaults.npcs[0].personality);
    expect(state.npcs.slice(1)).toEqual(defaults.npcs.slice(1));
    document.characters.azhuang['body.energy'] = 4;
    expect(state.npcs[0].initialSettings!.values['body.energy']).toBe(41);
  });
  it('修改人格用于真实事件评价和台词上下文，而不是只改 UI', () => {
    const document = defaultSettings(CAMP_SETTINGS_CATALOG);
    Object.assign(document.characters.laozhou, { 'trait.honesty': 1, 'trait.diligence': 1, 'trait.empathy': 1, 'trait.impulsivity': 0, 'trait.patience': 1 });
    const state = createGame({ npcSettings: document }); state.status = 'paused';
    const npc = state.npcs.find(person => person.id === 'laozhou')!;
    expect(getCampProfile(npc).traits.honesty).toBe(1);
    expect(npc.personality.diligence).toBe(1);
    expect(CAMP_PROFILES.laozhou.traits.honesty).toBe(.18);
    refreshCampMind(state, npc);
    recordMindEvent(state, npc, 'request_denied', '休息请求被拒绝', 'rest');
    expect(createDialogueTicket(state, npc).payload.persona).toContain('重视诚实');
    expect(createDialogueTicket(state, npc).payload.persona).not.toContain('老油条');
  });
  it('场景修正发生在模板之后，结果保持在范围内', () => {
    const document = defaultSettings(CAMP_SETTINGS_CATALOG);
    document.characters.azhuang['body.hunger'] = 90;
    document.characters.azhuang['body.trust'] = 10;
    const state = createGame({ scenario: 'conflict', npcSettings: document });
    expect(state.npcs[0].hunger).toBe(100); expect(state.npcs[0].trust).toBe(0);
    expect(state.npcs[0].command).toBe('wood');
  });
  it('继续存档保留身体、人格快照和不满，不重新初始化', () => {
    const document = defaultSettings(CAMP_SETTINGS_CATALOG);
    document.characters.linlan['trait.honesty'] = .9;
    document.characters.linlan['body.energy'] = 60;
    const state = createGame({ npcSettings: document }); state.status = 'paused';
    const npc = state.npcs.find(person => person.id === 'linlan')!;
    npc.energy = 19;
    refreshCampMind(state, npc);
    recordMindEvent(state, npc, 'request_denied', '第一次拒绝休息', 'rest');
    const before = structuredClone(npc);
    const memory = storage(); expect(saveGame(state, memory)).toBe(true);
    document.characters.linlan['body.energy'] = 100;
    document.characters.linlan['trait.honesty'] = 0;
    const resumed = loadGame(memory)!;
    expect(resumed.npcs.find(person => person.id === 'linlan')).toEqual(before);
    expect(getCampProfile(resumed.npcs.find(person => person.id === 'linlan')!).traits.honesty).toBe(.9);
  });
  it('未知快照版本保留原档并报告 unsupported，损坏字段不被静默修复', () => {
    const document = defaultSettings(CAMP_SETTINGS_CATALOG); document.characters.azhuang['body.energy'] = 30;
    const state = createGame({ npcSettings: document });
    expect(isValidCampInitialSettings({ schemaVersion: 1, values: { ...state.npcs[0].initialSettings!.values, unknown: 2 } })).toBe(false);
    const future = structuredClone(state) as unknown as { npcs: { initialSettings?: { schemaVersion: number } }[] };
    future.npcs[0].initialSettings!.schemaVersion = 2;
    const memory = storage(), text = JSON.stringify({ version: 1, savedAt: 1, state: future });
    memory.setItem(SAVE_KEY, text);
    expect(loadGameWithStatus(memory).status).toBe('unsupported');
    expect(memory.getItem(SAVE_KEY)).toBe(text);
  });
  it('禁止把初始模板重新套到正在进行的游戏', () => {
    const state = createGame(); state.status = 'playing';
    expect(() => applyCampInitialSettings(state, defaultSettings(CAMP_SETTINGS_CATALOG))).toThrow();
  });
  it('技能改变真实工作进度，50 中性，运输/休息/进食不加速', () => {
    const run = (skill: number, carried = false) => {
      const document = defaultSettings(CAMP_SETTINGS_CATALOG); document.characters.azhuang['skill.wood'] = skill;
      const state = createGame({ npcSettings: document }); state.status = 'playing';
      const npc = state.npcs[0];
      npc.action = 'wood'; npc.actionDuration = 5.5; npc.actionEffort = 1; npc.decisionIn = 100;
      npc.position = projectToWalkable(getTaskDestination('wood', npc.id, false), true);
      npc.destination = { ...npc.position };
      if (carried) npc.inventory.wood = 1;
      return advanceGame(state, .25, campPolicy).npcs[0].progress;
    };
    expect(run(100)).toBeCloseTo(run(50) * 1.5, 6);
    expect(run(0)).toBeCloseTo(run(50) * .5, 6);
    expect(run(100, true)).toBeCloseTo(run(50, true), 6);
    const document = defaultSettings(CAMP_SETTINGS_CATALOG); document.characters.azhuang['skill.wood'] = 100;
    const npc = createGame({ npcSettings: document }).npcs[0];
    expect(campSkillMultiplier(npc, 'rest')).toBe(1); expect(campSkillMultiplier(npc, 'eat')).toBe(1);
    expect(campSkillMultiplier(npc, 'wood')).toBe(1.5);
  });
});
