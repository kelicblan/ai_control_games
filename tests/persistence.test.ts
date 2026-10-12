import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS } from '../src/game/types';
import type { GameState, Npc, NpcId, PolicyFunction } from '../src/game/types';
import { advanceGame, createGame, issueCommand } from '../src/game/engine';
import { createAtmosphere, getWeatherSnapshot } from '../src/game/weather';
import { findRoute, isWalkable } from '../src/game/physics';
import { createNpc, isAtCamp, LOCATIONS } from '../src/game/constants';
import { createSocialState } from '../src/game/social';
import { NAVIGATION_CLEARANCE, TERRAIN } from '../src/game/terrain';
import {
  clearSave, isValidGameState, loadGame, loadGameWithStatus, saveGame, SAVE_KEY, SAVE_LIMITS,
} from '../src/game/persistence';
import type { SaveStorage } from '../src/game/persistence';

// Captured from the pre-weather engine at fac2f50, after its first real fixed step.
const LEGACY_ENGINE_SAVE = "{\"version\":1,\"savedAt\":1800000000000,\"state\":{\"version\":1,\"seed\":7315,\"randomState\":7315,\"status\":\"playing\",\"difficulty\":\"cozy\",\"scenario\":\"standard\",\"mode\":\"model\",\"elapsed\":0.25,\"duration\":240,\"day\":1,\"wood\":6,\"food\":6,\"fire\":81.9275,\"weather\":\"clear\",\"danger\":10,\"weatherUntil\":0,\"npcs\":[{\"id\":\"azhuang\",\"name\":\"阿壮\",\"role\":\"勇敢的行动派\",\"color\":\"#e8bd70\",\"personality\":{\"bravery\":0.9,\"diligence\":0.82,\"empathy\":0.4},\"health\":100,\"energy\":87.93374999999999,\"hunger\":26.0625,\"morale\":76.00875,\"trust\":76,\"fear\":6.925,\"position\":{\"x\":44.5362120511373,\"y\":63.63716294416231},\"destination\":{\"x\":17,\"y\":38},\"action\":\"wood\",\"command\":null,\"progress\":0,\"actionDuration\":5.5,\"decisionIn\":0,\"emotion\":\"calm\",\"speech\":\"找些干燥的木头，今晚用得上。\",\"speechUntil\":4.75,\"injured\":false,\"alive\":true,\"inventory\":{\"wood\":0,\"food\":0},\"completedTasks\":0,\"refusals\":0,\"lastInteraction\":0},{\"id\":\"xiaomi\",\"name\":\"小米\",\"role\":\"谨慎的观察者\",\"color\":\"#8bbcaf\",\"personality\":{\"bravery\":0.27,\"diligence\":0.78,\"empathy\":0.65},\"health\":100,\"energy\":83.93374999999999,\"hunger\":22.0625,\"morale\":72.00875,\"trust\":70,\"fear\":20.575,\"position\":{\"x\":50.32022921545736,\"y\":65.49767020310024},\"destination\":{\"x\":78,\"y\":34},\"action\":\"food\",\"command\":null,\"progress\":0,\"actionDuration\":5,\"decisionIn\":0,\"emotion\":\"calm\",\"speech\":\"我去看看浆果熟了没有。\",\"speechUntil\":4.75,\"injured\":false,\"alive\":true,\"inventory\":{\"wood\":0,\"food\":0},\"completedTasks\":0,\"refusals\":0,\"lastInteraction\":0},{\"id\":\"laozhou\",\"name\":\"老周\",\"role\":\"可靠的热心人\",\"color\":\"#b494c6\",\"personality\":{\"bravery\":0.56,\"diligence\":0.65,\"empathy\":0.96},\"health\":100,\"energy\":79.93374999999999,\"hunger\":32.0625,\"morale\":80.00875,\"trust\":84,\"fear\":10.825,\"position\":{\"x\":53.95865457302353,\"y\":69.404564288555},\"destination\":{\"x\":74,\"y\":73.2},\"action\":\"rest\",\"command\":null,\"progress\":0,\"actionDuration\":6,\"decisionIn\":0,\"emotion\":\"calm\",\"speech\":\"稍微歇一会儿，我就回来。\",\"speechUntil\":4.75,\"injured\":false,\"alive\":true,\"inventory\":{\"wood\":0,\"food\":0},\"completedTasks\":0,\"refusals\":0,\"lastInteraction\":0}],\"events\":[{\"id\":1,\"time\":0,\"kind\":\"info\",\"text\":\"天色渐晚。照顾三位队员，在天亮前守住篝火，最后一起回营。\"}],\"decisions\":[{\"id\":1,\"time\":0.25,\"npcId\":\"azhuang\",\"source\":\"rules\",\"action\":\"wood\",\"emotion\":\"calm\",\"scores\":[1,0,0,0,0,0,0,0],\"features\":[0.260625,0.8799125,1,0.7600875,0.07925,0.76,0.9,0.82,0.4,0.2,0.4,0.819275,0.1,0.0010416666666666667,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.03,0,0],\"allowed\":[\"wood\",\"food\",\"fire\",\"eat\",\"rest\",\"camp\",\"explore\"],\"latencyMs\":0,\"accepted\":true},{\"id\":2,\"time\":0.25,\"npcId\":\"xiaomi\",\"source\":\"rules\",\"action\":\"food\",\"emotion\":\"calm\",\"scores\":[0,1,0,0,0,0,0,0],\"features\":[0.220625,0.8399125,1,0.7200875000000001,0.21575,0.7,0.27,0.78,0.65,0.2,0.4,0.819275,0.1,0.0010416666666666667,0,0,0,1,0,0.5,0,0,0,0,0,0,0,0,0,0,0,0,0,0.02,0,0],\"allowed\":[\"wood\",\"food\",\"fire\",\"eat\",\"rest\",\"camp\",\"explore\"],\"latencyMs\":0,\"accepted\":true},{\"id\":3,\"time\":0.25,\"npcId\":\"laozhou\",\"source\":\"rules\",\"action\":\"rest\",\"emotion\":\"calm\",\"scores\":[0,0,0,0,1,0,0,0],\"features\":[0.320625,0.7999124999999999,1,0.8000875000000001,0.11825,0.84,0.56,0.65,0.96,0.2,0.4,0.819275,0.1,0.0010416666666666667,0,0,0,1,0,0.5,0.5,0,0,0,0,0,0,0,0,0,0,0,0,0.05,0,0],\"allowed\":[\"wood\",\"food\",\"fire\",\"eat\",\"rest\",\"camp\",\"explore\"],\"latencyMs\":0,\"accepted\":true}],\"selectedNpc\":\"azhuang\",\"priority\":\"balanced\",\"nextEventId\":2,\"nextDecisionId\":4,\"nextWorldEvent\":38,\"stats\":{\"gatheredWood\":0,\"gatheredFood\":0,\"meals\":0,\"helps\":0,\"modelDecisions\":0,\"ruleDecisions\":3,\"fallbackDecisions\":0,\"totalLatency\":0,\"taskSwitches\":0},\"resultReason\":\"\",\"score\":1788}}";

// fac2f50 completed this north-bank crossing before the creek extended through the map.
const LEGACY_EAST_BANK_SAVE = "{\"version\":1,\"savedAt\":1800000000000,\"state\":{\"version\":1,\"seed\":7315,\"randomState\":7315,\"status\":\"playing\",\"difficulty\":\"cozy\",\"scenario\":\"standard\",\"mode\":\"model\",\"elapsed\":2,\"duration\":240,\"day\":1,\"wood\":6,\"food\":6,\"fire\":81.41999999999996,\"weather\":\"clear\",\"danger\":10,\"weatherUntil\":0,\"npcs\":[{\"id\":\"azhuang\",\"name\":\"阿壮\",\"role\":\"勇敢的行动派\",\"color\":\"#e8bd70\",\"personality\":{\"bravery\":0.9,\"diligence\":0.82,\"empathy\":0.4},\"health\":100,\"energy\":87.46999999999991,\"hunger\":26.5,\"morale\":76,\"trust\":76,\"fear\":7.690205154140356,\"position\":{\"x\":96,\"y\":18},\"destination\":{\"x\":96,\"y\":18},\"action\":null,\"command\":null,\"progress\":0,\"actionDuration\":0,\"decisionIn\":0.6,\"emotion\":\"calm\",\"speech\":\"我过去看看，脚下会留神。\",\"speechUntil\":2,\"injured\":false,\"alive\":true,\"inventory\":{\"wood\":0,\"food\":0},\"completedTasks\":0,\"refusals\":0,\"lastInteraction\":0.001},{\"id\":\"xiaomi\",\"name\":\"小米\",\"role\":\"谨慎的观察者\",\"color\":\"#8bbcaf\",\"personality\":{\"bravery\":0.27,\"diligence\":0.78,\"empathy\":0.65},\"health\":100,\"energy\":83.46999999999991,\"hunger\":22.5,\"morale\":72.07000000000005,\"trust\":70,\"fear\":18.045489068758695,\"position\":{\"x\":63.44839305244942,\"y\":71.26175320152082},\"destination\":{\"x\":71,\"y\":73.2},\"action\":\"rest\",\"command\":null,\"progress\":0,\"actionDuration\":6,\"decisionIn\":0,\"emotion\":\"calm\",\"speech\":\"稍微歇一会儿，我就回来。\",\"speechUntil\":4.75,\"injured\":false,\"alive\":true,\"inventory\":{\"wood\":0,\"food\":0},\"completedTasks\":0,\"refusals\":0,\"lastInteraction\":0},{\"id\":\"laozhou\",\"name\":\"老周\",\"role\":\"可靠的热心人\",\"color\":\"#b494c6\",\"personality\":{\"bravery\":0.56,\"diligence\":0.65,\"empathy\":0.96},\"health\":100,\"energy\":79.46999999999991,\"hunger\":32.5,\"morale\":80.07000000000005,\"trust\":84,\"fear\":9.878971032136075,\"position\":{\"x\":67.69339992631454,\"y\":72.10914421127183},\"destination\":{\"x\":74,\"y\":73.2},\"action\":\"rest\",\"command\":null,\"progress\":0,\"actionDuration\":6,\"decisionIn\":0,\"emotion\":\"calm\",\"speech\":\"稍微歇一会儿，我就回来。\",\"speechUntil\":4.75,\"injured\":false,\"alive\":true,\"inventory\":{\"wood\":0,\"food\":0},\"completedTasks\":0,\"refusals\":0,\"lastInteraction\":0}],\"events\":[{\"id\":1,\"time\":0,\"kind\":\"info\",\"text\":\"天色渐晚。照顾三位队员，在天亮前守住篝火，最后一起回营。\"}],\"decisions\":[{\"id\":1,\"time\":0.25,\"npcId\":\"xiaomi\",\"source\":\"rules\",\"action\":\"rest\",\"emotion\":\"calm\",\"scores\":[0,0,0,0,1,0,0,0],\"features\":[0.220625,0.8399125,1,0.7200875000000001,0.21575,0.7,0.27,0.78,0.65,0.2,0.4,0.819275,0.1,0.0010416666666666667,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.02,0,0],\"allowed\":[\"wood\",\"food\",\"fire\",\"eat\",\"rest\",\"camp\",\"explore\"],\"latencyMs\":0,\"accepted\":true},{\"id\":2,\"time\":0.25,\"npcId\":\"laozhou\",\"source\":\"rules\",\"action\":\"rest\",\"emotion\":\"calm\",\"scores\":[0,0,0,0,1,0,0,0],\"features\":[0.320625,0.7999124999999999,1,0.8000875000000001,0.11825,0.84,0.56,0.65,0.96,0.2,0.4,0.819275,0.1,0.0010416666666666667,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.05,0,0],\"allowed\":[\"wood\",\"food\",\"fire\",\"eat\",\"rest\",\"camp\",\"explore\"],\"latencyMs\":0,\"accepted\":true}],\"selectedNpc\":\"azhuang\",\"priority\":\"balanced\",\"nextEventId\":2,\"nextDecisionId\":3,\"nextWorldEvent\":38,\"stats\":{\"gatheredWood\":0,\"gatheredFood\":0,\"meals\":0,\"helps\":0,\"modelDecisions\":0,\"ruleDecisions\":2,\"fallbackDecisions\":0,\"totalLatency\":0,\"taskSwitches\":0},\"resultReason\":\"\",\"score\":1790}}";

class MemoryStorage implements SaveStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function fixture(): GameState {
  const person = (id: NpcId, index: number): Npc => ({
    id, name: ['阿壮', '小米', '老周'][index], role: '营地队员', color: '#c6ba77',
    personality: { bravery: 0.7, diligence: 0.8, empathy: 0.6 },
    health: 93, energy: 72, hunger: 31, morale: 68, trust: 84, fear: 12, wetness: 21,
    position: { x: 23 + index * 8, y: 42 }, destination: { x: 52, y: 60 },
    action: 'wood', command: index === 0 ? 'wood' : null,
    progress: 0.4, actionDuration: 6, decisionIn: 1.2, emotion: 'calm',
    speech: '再找一些干木头。', speechUntil: 76, injured: false, alive: true,
    inventory: { wood: 3, food: 0 }, completedTasks: 7, refusals: 1, lastInteraction: 35,
  });
  const npcs = [person('azhuang', 0), person('xiaomi', 1), person('laozhou', 2), createNpc('linlan', 73.5), createNpc('aye', 73.5)];
  return {
    version: 1, seed: 7315, randomState: 4294923111, status: 'playing',
    difficulty: 'normal', scenario: 'storm', mode: 'model', elapsed: 73.5, duration: 240, day: 1,
    wood: 14, food: 9, fire: 74.5, weather: 'rain', danger: 32, weatherUntil: 89,
    atmosphere: createAtmosphere(7315, 'rain', 73.5), shelterIntegrity: 91,
    npcs, social: createSocialState(npcs, 73.5),
    events: [
      { id: 15, time: 72, kind: 'warning', text: '雨还没有停。' },
      { id: 14, time: 70, kind: 'good', text: '阿壮带回了木材。', npcId: 'azhuang' },
    ],
    decisions: [{
      id: 28, time: 71, npcId: 'azhuang', source: 'model', action: 'wood', emotion: 'calm',
      scores: ACTIONS.map((_, index) => index === 0 ? 0.72 : 0.04),
      features: Array.from({ length: 36 }, (_, index) => index / 36),
      featureVersion: 1,
      allowed: ['wood', 'food', 'rest', 'camp'], latencyMs: 0.34, accepted: true,
    }],
    selectedNpc: 'xiaomi', priority: 'wood', nextEventId: 16, nextDecisionId: 29, nextWorldEvent: 82,
    stats: { gatheredWood: 23, gatheredFood: 16, meals: 9, helps: 2, modelDecisions: 29,
      ruleDecisions: 0, fallbackDecisions: 0, totalLatency: 16.48, taskSwitches: 8 },
    resultReason: '', score: 0,
  };
}

function writeRaw(storage: SaveStorage, state: unknown, version = 1): void {
  storage.setItem(SAVE_KEY, JSON.stringify({ version, savedAt: 1_800_000_000_000, state }));
}

function socialFixture(): GameState {
  const state = fixture();
  state.social.relationships.find(pair => pair.from === 'linlan' && pair.to === 'aye')!.affinity = 31;
  state.social.relationships.find(pair => pair.from === 'aye' && pair.to === 'linlan')!.affinity = 74;
  state.social.nextId = 10;
  state.social.nextLineId = 4;
  state.social.threads = [{ id: 1, kind: 'fairness', initiator: 'linlan', participants: ['linlan', 'aye'],
    title: '轮流做事', prompt: '要不要交换分工？', createdAt: 60, expiresAt: 90, status: 'resolved', revision: 2,
    lines: [{ id: 1, speaker: 'linlan', text: '我们轮流做事吧。', at: 60, source: 'template' },
      { id: 2, speaker: 'player', text: '好，回来后换班。', at: 61, source: 'player' },
      { id: 3, speaker: 'aye', text: '行，我先去找食物。', at: 62, source: 'minimind3' }],
    choiceId: 'rotate', resolution: '阿野先去采集食物。' }];
  // A pruned thread (2) remains the factual source for old memories/promises.
  state.social.memories = [{ id: 3, npcId: 'linlan', otherId: 'aye', threadId: 2, at: 61, kind: 'agreement', text: '阿野答应轮班。' }];
  state.social.promises = [{ id: 4, npcId: 'aye', threadId: 2, kind: 'rest', createdAt: 61, dueAt: 110, status: 'pending', fulfilledAt: null },
    { id: 5, npcId: 'xiaomi', threadId: 2, kind: 'meal', createdAt: 61, dueAt: 70, status: 'kept', fulfilledAt: 65 }];
  state.social.agreements = [{ id: 6, npcId: 'aye', threadId: 1, action: 'food', createdAt: 62, until: 95 }];
  return state;
}

afterEach(() => vi.unstubAllGlobals());

describe('versioned local save', () => {
  it('round-trips conversation turns, pending promises and memories whose source thread was pruned', () => {
    const storage = new MemoryStorage();
    const state = socialFixture();
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...state, status: 'paused' });
    const restored = loadGame(storage)!;
    expect(restored.social.relationships.find(pair => pair.from === 'linlan' && pair.to === 'aye')!.affinity).toBe(31);
    expect(restored.social.relationships.find(pair => pair.from === 'aye' && pair.to === 'linlan')!.affinity).toBe(74);
    restored.social.relationships[0].affinity = 0;
    restored.social.memories[0].text = '改过的记忆';
    expect(state.social.relationships[0].affinity).toBe(60);
    expect(state.social.memories[0].text).toBe('阿野答应轮班。');
  });

  const socialMutations: [string, (state: GameState) => void][] = [
    ['missing social state', state => { Reflect.deleteProperty(state, 'social'); }],
    ['incomplete roster with social state', state => { state.npcs = state.npcs.slice(0, 3); }],
    ['missing social person', state => { Reflect.deleteProperty(state.social.people, 'aye'); }],
    ['unknown social person', state => { Object.assign(state.social.people, { stranger: state.social.people.aye }); }],
    ['unbounded resentment', state => { state.social.people.linlan.resentment = 101; }],
    ['non-finite workload', state => { state.social.people.aye.workload = Infinity; }],
    ['negative cooldown', state => { state.social.people.aye.cooldownUntil = -1; }],
    ['incomplete relationships', state => { state.social.relationships.pop(); }],
    ['duplicate directed relationship', state => { state.social.relationships[1] = { ...state.social.relationships[0] }; }],
    ['self relationship', state => { state.social.relationships[0].to = state.social.relationships[0].from; }],
    ['unbounded affinity', state => { state.social.relationships[0].affinity = -1; }],
    ['unknown thread participant', state => { state.social.threads[0].participants.push('stranger' as NpcId); }],
    ['duplicate thread participant', state => { state.social.threads[0].participants.push('aye'); }],
    ['initiator missing from conversation', state => { state.social.threads[0].participants = ['aye']; }],
    ['speaker outside conversation', state => { state.social.threads[0].lines[0].speaker = 'xiaomi'; }],
    ['duplicate line ID', state => { state.social.threads[0].lines[1].id = 1; }],
    ['line ID outside counter', state => { state.social.nextLineId = 3; }],
    ['future conversation line', state => { state.social.threads[0].lines[0].at = state.elapsed + 1; }],
    ['overlong conversation turn', state => { state.social.threads[0].lines[0].text = '话'.repeat(401); }],
    ['unknown conversation source', state => { state.social.threads[0].lines[0].source = 'fiction' as never; }],
    ['duplicate history ID', state => { state.social.memories[0].id = state.social.threads[0].id; }],
    ['unissued thread reference', state => { state.social.memories[0].threadId = state.social.nextId; }],
    ['unknown memory subject', state => { state.social.memories[0].npcId = 'stranger' as NpcId; }],
    ['future memory', state => { state.social.memories[0].at = state.elapsed + 1; }],
    ['unknown promise kind', state => { state.social.promises[0].kind = 'gold' as never; }],
    ['pending promise with fulfillment', state => { state.social.promises[0].fulfilledAt = 65; }],
    ['kept promise without fulfillment', state => { state.social.promises[1].fulfilledAt = null; }],
    ['future promise fulfillment', state => { state.social.promises[1].fulfilledAt = state.elapsed + 1; }],
    ['promise due before creation', state => { state.social.promises[0].dueAt = 1; }],
    ['invalid agreement action', state => { state.social.agreements[0].action = 'teleport' as never; }],
    ['expired-before-created agreement', state => { state.social.agreements[0].until = 1; }],
    ['negative social statistic', state => { state.social.stats.kept = -1; }],
    ['unknown social property', state => { Object.assign(state.social, { unchecked: {} }); }],
  ];

  it.each(socialMutations)('rejects malformed social data with %s without replacing a good save', (_label, mutate) => {
    const storage = new MemoryStorage();
    const good = socialFixture();
    expect(saveGame(good, storage)).toBe(true);
    const serialized = storage.getItem(SAVE_KEY);
    const invalid = socialFixture();
    mutate(invalid);
    expect(saveGame(invalid, storage)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(serialized);
    writeRaw(storage, invalid);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
  });

  it('upgrades an existing three-person weather save without rewriting past events, decisions or tasks', () => {
    const storage = new MemoryStorage();
    const { social: _social, ...previous } = fixture();
    previous.npcs = previous.npcs.slice(0, 3);
    writeRaw(storage, previous);
    const restored = loadGame(storage)!;
    expect(restored.npcs.map(npc => npc.id)).toEqual(['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye']);
    expect(restored.npcs.slice(0, 3)).toEqual(previous.npcs);
    expect(restored.events).toEqual(previous.events);
    expect(restored.decisions).toEqual(previous.decisions);
    expect(JSON.stringify(restored.decisions.map(record => record.features))).toBe(JSON.stringify(previous.decisions.map(record => record.features)));
    expect(restored.randomState).toBe(previous.randomState);
    expect([restored.wood, restored.food, restored.fire]).toEqual([previous.wood, previous.food, previous.fire]);
    expect(restored.social.introduced).toBe(true);
    expect(restored.social.threads).toEqual([]);
    expect(restored.social.memories).toEqual([]);
    expect(restored.npcs.slice(3).every(npc => isWalkable(npc.position, true, NAVIGATION_CLEARANCE))).toBe(true);
    expect(saveGame(restored, storage)).toBe(true);
    expect(loadGame(storage)).toEqual(restored);
  });

  it('preserves recorded 41-dimensional weather decisions while upgrading an old complete roster', () => {
    const storage = new MemoryStorage();
    const { social: _social, ...previous } = fixture();
    previous.npcs = previous.npcs.slice(0, 3);
    previous.decisions[0] = { ...previous.decisions[0], featureVersion: 2,
      features: Array.from({ length: 41 }, (_, index) => index / 41), trigger: 'weather',
      weather: getWeatherSnapshot(fixture(), previous.npcs[0]) };
    previous.events[0].text = '三位队员一起抵达旧营地。';
    const history = JSON.stringify({ events: previous.events, decisions: previous.decisions });
    writeRaw(storage, previous);
    const restored = loadGame(storage)!;
    expect(JSON.stringify({ events: restored.events, decisions: restored.decisions })).toBe(history);
    expect(restored.npcs.slice(0, 3)).toEqual(previous.npcs);
    expect(restored.social.people.linlan.resentment).toBe(0);
    expect(restored.social.promises).toEqual([]);
    expect(restored.social.relationships).toHaveLength(20);
  });

  it('does not reinterpret a partially damaged social save as a legacy roster', () => {
    const storage = new MemoryStorage();
    for (const count of [3, 4, 5]) {
      const { social: _social, ...damaged } = fixture();
      damaged.npcs = damaged.npcs.slice(0, count);
      damaged.npcs[0].decisionTrigger = 'social';
      writeRaw(storage, damaged);
      expect(loadGameWithStatus(storage).status).toBe('invalid');
    }
  });

  it('rejects invented future companions in the contact history of an old three-person save', () => {
    const storage = new MemoryStorage();
    const { social: _social, ...previous } = fixture();
    previous.npcs = previous.npcs.slice(0, 3);
    previous.npcs[0].collision = { hurtUntil: 74, reactionUntil: 75, objectCooldowns: { aye: 75 } };
    writeRaw(storage, previous);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
  });
  it('reconnects an actual old east-bank save to camp after the river expands', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, LEGACY_EAST_BANK_SAVE);
    const legacy = JSON.parse(LEGACY_EAST_BANK_SAVE).state;
    expect(legacy.npcs[0].position).toEqual({ x: 96, y: 18 });
    const restored = loadGame(storage)!;
    expect(restored.status).toBe('paused');
    expect(findRoute(restored.npcs[0].position, LOCATIONS.camp).length).toBeGreaterThan(0);
    expect(isWalkable(restored.npcs[0].position, true, NAVIGATION_CLEARANCE)).toBe(true);
    expect(restored.npcs.slice(1, 3).map(npc => ({ position: npc.position, destination: npc.destination })))
      .toEqual(legacy.npcs.slice(1).map((npc: Npc) => ({ position: npc.position, destination: npc.destination })));
    expect(restored.decisions.map(record => record.features)).toEqual(legacy.decisions.map((record: { features: number[] }) => record.features));
    expect(restored.events.some(event => event.text.includes('河道') && event.text.includes('阿壮'))).toBe(true);
    const policy: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0, scores: ACTIONS.map(action => Number(action === 'camp')) });
    const resumed = advanceGame(issueCommand({ ...restored, status: 'playing' }, { type: 'assign', npcId: 'azhuang', action: 'camp' }), 8, policy);
    expect(resumed.npcs[0].position).not.toEqual(restored.npcs[0].position);
    expect(isAtCamp(resumed.npcs[0])).toBe(true);
    expect(saveGame(resumed, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...resumed, status: 'paused' });
  });

  it('moves newly submerged legacy ground onto a safe camp-connected bank', () => {
    const storage = new MemoryStorage();
    const legacy = JSON.parse(LEGACY_EAST_BANK_SAVE).state;
    const creek = TERRAIN.find(object => object.id === 'deep-creek')!;
    legacy.npcs[0].position = { x: creek.shape.center.x, y: 18 };
    legacy.npcs[0].destination = { ...legacy.npcs[0].position };
    writeRaw(storage, legacy);
    const restored = loadGame(storage)!;
    expect(isWalkable(restored.npcs[0].position, true, NAVIGATION_CLEARANCE)).toBe(true);
    expect(restored.npcs[0].position.x).toBeLessThan(creek.shape.center.x);
    expect(findRoute(restored.npcs[0].position, LOCATIONS.camp).length).toBeGreaterThan(0);
    expect(restored.npcs[0].health).toBe(legacy.npcs[0].health);
  });

  it('repairs an old crossing target while preserving an unaffected west-bank manual route', () => {
    const storage = new MemoryStorage();
    const legacy = JSON.parse(LEGACY_EAST_BANK_SAVE).state;
    legacy.npcs[0].position = { x: 80, y: 18 };
    legacy.npcs[0].manualTarget = { x: 96, y: 18 };
    legacy.npcs[0].destination = { ...legacy.npcs[0].manualTarget };
    legacy.npcs[1].position = { x: 40, y: 80 };
    legacy.npcs[1].manualTarget = { x: 48, y: 80 };
    legacy.npcs[1].destination = { ...legacy.npcs[1].manualTarget };
    legacy.npcs[1].action = null;
    writeRaw(storage, legacy);
    const restored = loadGame(storage)!;
    expect(restored.npcs[0].position).toEqual(legacy.npcs[0].position);
    expect(restored.npcs[0].manualTarget).not.toEqual(legacy.npcs[0].manualTarget);
    expect(findRoute(restored.npcs[0].position, restored.npcs[0].manualTarget!).length).toBeGreaterThan(0);
    expect(restored.npcs[0].destination).toEqual(restored.npcs[0].manualTarget);
    expect({ position: restored.npcs[1].position, destination: restored.npcs[1].destination, manualTarget: restored.npcs[1].manualTarget })
      .toEqual({ position: legacy.npcs[1].position, destination: legacy.npcs[1].destination, manualTarget: legacy.npcs[1].manualTarget });
    const policy: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0, scores: ACTIONS.map(action => Number(action === 'camp')) });
    const resumed = advanceGame({ ...restored, status: 'playing' }, 2, policy);
    expect(resumed.npcs[0].manualTarget).toBeUndefined();
    expect(resumed.npcs[0].health).toBe(restored.npcs[0].health);
  });

  it('migrates a real v1 engine save without fabricating its historical observation values', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, LEGACY_ENGINE_SAVE);
    const legacy = JSON.parse(LEGACY_ENGINE_SAVE).state;
    const restored = loadGameWithStatus(storage);
    expect(restored.status).toBe('restored');
    const state = restored.state!;
    expect(state.atmosphere).toBeDefined();
    expect(state.shelterIntegrity).toBe(100);
    expect(state.npcs.map(npc => npc.wetness)).toEqual([0, 0, 0, 0, 0]);
    expect(state.npcs.slice(0, 3).map(npc => ({ action: npc.action, progress: npc.progress, destination: npc.destination })))
      .toEqual(legacy.npcs.map((npc: Npc) => ({ action: npc.action, progress: npc.progress, destination: npc.destination })));
    expect(state.decisions.map(record => record.features)).toEqual(legacy.decisions.map((record: { features: number[] }) => record.features));
    expect(state.decisions.every(record => record.featureVersion === 1 && record.features.length === 36 && record.weather === undefined)).toBe(true);
    const policy: PolicyFunction = () => ({ action: 'rest', emotion: 'calm', source: 'rules', latencyMs: 0, scores: ACTIONS.map(action => Number(action === 'rest')) });
    const resumed = advanceGame(issueCommand({ ...state, status: 'playing' }, { type: 'weather', weather: 'storm' }), 1, policy);
    expect(resumed.elapsed).toBeGreaterThan(state.elapsed);
    expect(resumed.decisions.some(record => record.featureVersion === 2 && record.features.length === 41)).toBe(true);
    expect(saveGame(resumed, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...resumed, status: 'paused' });
  });

  it('round-trips current weather, a lightning flash and pending protected decisions', () => {
    const storage = new MemoryStorage();
    let state = fixture();
    state.weather = 'storm';
    state.atmosphere = { ...createAtmosphere(state.seed, 'storm', state.elapsed), lightningAt: state.elapsed - .1, lightningPoint: { x: 42, y: 35 } };
    state.npcs[0].decisionTrigger = 'thunder'; state.npcs[0].previousAction = 'wood';
    state.decisions[0] = { ...state.decisions[0], features: Array.from({ length: 41 }, (_, index) => index / 41),
      featureVersion: 2, trigger: 'weather', previousAction: 'wood', weather: getWeatherSnapshot(state, state.npcs[0]) };
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...state, status: 'paused' });
    state = loadGame(storage)!;
    expect(advanceGame(state, 30, () => { throw new Error('Paused inference must not run'); })).toEqual(state);
  });

  const weatherMutations: [string, (state: GameState) => void][] = [
    ['wind outside its unit interval', state => { state.atmosphere.windStrength = 2; }],
    ['non-finite wind angle', state => { state.atmosphere.windAngle = Infinity; }],
    ['rain outside its unit interval', state => { state.atmosphere.rainIntensity = -1; }],
    ['fractional forecast revision', state => { state.atmosphere.revision = .5; }],
    ['unbounded storm risk', state => { state.atmosphere.stormRisk = 200; }],
    ['unbounded lightning time', state => { state.atmosphere.nextLightningAt = 1e9; }],
    ['lightning from the future', state => { state.atmosphere.lightningAt = state.elapsed + 1; state.atmosphere.lightningPoint = { x: 2, y: 2 }; }],
    ['strike point without a lightning time', state => { state.atmosphere.lightningPoint = { x: 2, y: 2 }; }],
    ['negative wetness', state => { state.npcs[0].wetness = -1; }],
    ['shelter above full integrity', state => { state.shelterIntegrity = 101; }],
    ['missing atmosphere in a current save', state => { Reflect.deleteProperty(state, 'atmosphere'); }],
    ['missing wetness in a current save', state => { Reflect.deleteProperty(state.npcs[0], 'wetness'); }],
    ['unknown pending trigger', state => { state.npcs[0].decisionTrigger = 'magic' as never; }],
    ['unknown previous action', state => { state.npcs[0].previousAction = 'teleport' as never; }],
    ['mismatched feature schema', state => { state.decisions[0].featureVersion = 1; }],
    ['unversioned current features', state => { delete state.decisions[0].featureVersion; }],
    ['invalid recorded exposure', state => { state.decisions[0].weather!.exposure = 2; }],
    ['normalized-looking negative raw distance', state => { state.decisions[0].weather!.shelterDistance = -1; }],
    ['unknown recorded weather kind', state => { state.decisions[0].weather!.kind = 'snow' as never; }],
    ['unexpected observation context', state => { Object.assign(state.decisions[0], { context: { self: { position: { x: Infinity, y: 3 } } } }); }],
  ];

  it.each(weatherMutations)('rejects malformed weather data with %s', (_label, mutate) => {
    const storage = new MemoryStorage();
    const state = fixture();
    state.decisions[0] = { ...state.decisions[0], features: Array.from({ length: 41 }, (_, index) => index / 41),
      featureVersion: 2, trigger: 'weather', previousAction: 'wood', weather: getWeatherSnapshot(state, state.npcs[0]) };
    expect(isValidGameState(state)).toBe(true);
    mutate(state);
    expect(saveGame(state, storage)).toBe(false);
    writeRaw(storage, state);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
  });

  it('restores actual engine snapshots and continues with identical RNG and in-flight tasks', () => {
    const storage = new MemoryStorage();
    const ready = createGame({ seed: 0, scenario: 'storm' });
    expect(saveGame(ready, storage)).toBe(true);
    expect(loadGame(storage)).toEqual(ready);
    const deterministicRule: PolicyFunction = observation => ({
      action: observation.allowed[0], emotion: 'calm', source: 'rules', latencyMs: 0,
      scores: ACTIONS.map(action => action === observation.allowed[0] ? 1 : 0),
    });
    let state: GameState = { ...ready, status: 'playing' };
    for (let step = 0; step < 120; step++) state = advanceGame(state, 0.25, deterministicRule);
    expect(state.decisions.length).toBeGreaterThan(0);
    expect(saveGame(state, storage)).toBe(true);
    const restored = loadGame(storage)!;
    expect(restored).toEqual({ ...state, status: 'paused' });
    expect(advanceGame({ ...restored, status: 'playing' }, 0.25, deterministicRule))
      .toEqual(advanceGame(state, 0.25, deterministicRule));
  });

  it('round-trips every part of an active game and resumes safely paused without changing the original', () => {
    const storage = new MemoryStorage();
    const game = fixture();
    expect(saveGame(game, storage)).toBe(true);
    const result = loadGameWithStatus(storage);
    expect(result.status).toBe('restored');
    expect(result.savedAt).toBeTypeOf('number');
    expect(result.state).toEqual({ ...game, status: 'paused' });
    expect(game.status).toBe('playing');
    expect(result.state?.npcs).not.toBe(game.npcs);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).state.status).toBe('playing');
  });

  it('retains a manual route and contact cooldowns across an interrupted session', () => {
    const storage = new MemoryStorage();
    const policy: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0,
      scores: ACTIONS.map(action => Number(action === 'camp')) });
    let state: GameState = { ...createGame({ seed: 17 }), status: 'playing' };
    state.npcs[0].position = { x: 51, y: 65 };
    state = issueCommand(state, { type: 'move', npcId: 'azhuang', target: { x: 51, y: 54 } });
    expect(state.npcs[0].manualTarget).toBeDefined();
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...state, status: 'paused' });
    state = advanceGame(state, 1, policy);
    expect(state.npcs[0].collision?.lastHit?.kind).toBe('burn');
    expect(state.events.some(event => event.reaction?.kind === 'burn')).toBe(true);
    expect(saveGame(state, storage)).toBe(true);
    const resumed = loadGame(storage)!;
    expect(resumed).toEqual({ ...state, status: 'paused' });
    expect(advanceGame({ ...resumed, status: 'playing' }, .25, policy)).toEqual(advanceGame(state, .25, policy));
  });

  it('accepts bounded optional reactions without changing an old v1 snapshot', () => {
    const storage = new MemoryStorage();
    const old = fixture();
    expect(saveGame(old, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...old, status: 'paused' });
    const state = fixture();
    state.npcs[0].manualTarget = { x: 51, y: 54 };
    state.npcs[0].collision = { hurtUntil: 74, reactionUntil: 75, objectCooldowns: { campfire: 75 },
      lastHit: { kind: 'burn', objectId: 'campfire', time: 72, intensity: .6, damage: 7 } };
    state.events[0].npcId = 'azhuang';
    state.events[0].reaction = { kind: 'burn', objectId: 'campfire', intensity: .6, utterance: '啊，好烫！' };
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...state, status: 'paused' });
  });

  const contactMutations: [string, (state: GameState) => void][] = [
    ['off-map manual target', state => { state.npcs[0].manualTarget!.x = 101; }],
    ['non-finite manual target', state => { state.npcs[0].manualTarget!.y = Infinity; }],
    ['negative contact cooldown', state => { state.npcs[0].collision!.hurtUntil = -1; }],
    ['unbounded object cooldown', state => { state.npcs[0].collision!.objectCooldowns.campfire = 1_000_000; }],
    ['unexpected contact dictionary key', state => { state.npcs[0].collision!.objectCooldowns.constructor = 1 as never; }],
    ['unknown hit object', state => { state.npcs[0].collision!.lastHit!.objectId = 'imaginary-object'; }],
    ['injury from the future', state => { state.npcs[0].collision!.lastHit!.time = state.elapsed + 1; }],
    ['negative injury damage', state => { state.npcs[0].collision!.lastHit!.damage = -1; }],
    ['unbounded injury intensity', state => { state.npcs[0].collision!.lastHit!.intensity = 2; }],
    ['unknown reaction kind', state => { state.events[0].reaction!.kind = 'magic' as never; }],
    ['reaction without an NPC', state => { delete state.events[0].npcId; }],
    ['unbounded reaction utterance', state => { state.events[0].reaction!.utterance = '痛'.repeat(401); }],
  ];

  it.each(contactMutations)('rejects new untrusted state with %s', (_name, mutate) => {
    const storage = new MemoryStorage();
    const state = fixture();
    state.npcs[0].manualTarget = { x: 51, y: 54 };
    state.npcs[0].collision = { hurtUntil: 74, reactionUntil: 75, objectCooldowns: { campfire: 75 },
      lastHit: { kind: 'burn', objectId: 'campfire', time: 72, intensity: .6, damage: 7 } };
    state.events[0].npcId = 'azhuang';
    state.events[0].reaction = { kind: 'burn', objectId: 'campfire', intensity: .6, utterance: '啊，好烫！' };
    expect(isValidGameState(state)).toBe(true);
    mutate(state);
    expect(saveGame(state, storage)).toBe(false);
    writeRaw(storage, state);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
  });

  it.each(['ready', 'paused', 'won', 'lost'] as const)('preserves a %s game without restarting it', status => {
    const storage = new MemoryStorage();
    const game = { ...fixture(), status, resultReason: status === 'won' ? '三位队员平安等到了黎明。' : '' };
    expect(saveGame(game, storage)).toBe(true);
    expect(loadGame(storage)).toEqual(game);
  });

  it('preserves optional fields and accepts normal in-memory undefined optionals', () => {
    const storage = new MemoryStorage();
    const game = fixture();
    game.events[0].npcId = undefined;
    game.decisions[0].reason = undefined;
    expect(saveGame(game, storage)).toBe(true);
    expect(loadGame(storage)?.decisions[0].reason).toBeUndefined();
    game.decisions[0].reason = '刚完成上一个任务';
    expect(saveGame(game, storage)).toBe(true);
    expect(loadGame(storage)?.decisions[0].reason).toBe('刚完成上一个任务');
  });

  it('returns missing for a new player and clears only its own storage key', () => {
    const storage = new MemoryStorage();
    storage.setItem('another-game', 'keep me');
    expect(loadGameWithStatus(storage).status).toBe('missing');
    expect(saveGame(fixture(), storage)).toBe(true);
    expect(clearSave(storage)).toBe(true);
    expect(loadGame(storage)).toBeNull();
    expect(storage.getItem('another-game')).toBe('keep me');
  });

  it.each(['not JSON', '{"version":1,', 'null', '[]', '{}', '{"version":1}'])('discards a corrupt snapshot: %s', raw => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const result = loadGameWithStatus(storage);
    expect(result.status).toBe('invalid');
    expect(result.state).toBeNull();
    expect(result.message.length).toBeGreaterThan(0);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(loadGameWithStatus(storage).status).toBe('missing');
  });

  it('refuses future envelope or state versions while preserving them for a future compatible release', () => {
    const storage = new MemoryStorage();
    writeRaw(storage, fixture(), 2);
    expect(loadGameWithStatus(storage).status).toBe('unsupported');
    expect(loadGame(storage)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    writeRaw(storage, { ...fixture(), version: 2 });
    expect(loadGameWithStatus(storage).status).toBe('unsupported');
  });

  const mutations: [string, (game: GameState) => void][] = [
    ['negative food', game => { game.food = -1; }],
    ['fractional resource count', game => { game.wood = 1.25; }],
    ['wood above the engine capacity of 100', game => { game.wood = 101; }],
    ['food above the engine capacity of 100', game => { game.food = 101; }],
    ['unsafe seed', game => { game.seed = 2 ** 40; }],
    ['negative RNG state', game => { game.randomState = -1; }],
    ['health above 100', game => { game.npcs[0].health = 101; }],
    ['negative trust', game => { game.npcs[1].trust = -0.1; }],
    ['off-map coordinates', game => { game.npcs[0].destination.x = 101; }],
    ['progress above 1', game => { game.npcs[0].progress = 7; }],
    ['invalid personality', game => { game.npcs[0].personality.empathy = 2; }],
    ['oversized carried inventory', game => { game.npcs[0].inventory.wood = 7; }],
    ['unknown NPC', game => { game.npcs[0].id = 'unknown' as NpcId; }],
    ['duplicate NPC', game => { game.npcs[1].id = game.npcs[0].id; }],
    ['missing NPC', game => { game.npcs.pop(); }],
    ['unknown action', game => { game.npcs[0].action = 'teleport' as Npc['action']; }],
    ['unknown emotion', game => { game.npcs[0].emotion = 'furious' as Npc['emotion']; }],
    ['unknown game status', game => { game.status = 'running' as GameState['status']; }],
    ['unknown weather', game => { game.weather = 'snow' as GameState['weather']; }],
    ['unknown policy mode', game => { game.mode = 'hardcoded' as GameState['mode']; }],
    ['wrong feature count', game => { game.decisions[0].features.pop(); }],
    ['out-of-range feature', game => { game.decisions[0].features[0] = -1; }],
    ['wrong score count', game => { game.decisions[0].scores = []; }],
    ['duplicate allowed action', game => { game.decisions[0].allowed = ['wood', 'wood']; }],
    ['event from the future', game => { game.events[0].time = game.elapsed + 1; }],
    ['duplicate event ID', game => { game.events[1].id = game.events[0].id; }],
    ['event ID exceeds its counter', game => { game.nextEventId = game.events[0].id; }],
    ['negative aggregate statistic', game => { game.stats.meals = -1; }],
  ];

  it.each(mutations)('rejects untrusted data with %s before the engine sees it', (_name, mutate) => {
    const storage = new MemoryStorage();
    const game = fixture();
    mutate(game);
    expect(saveGame(game, storage)).toBe(false);
    writeRaw(storage, game);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
    expect(loadGame(storage)).toBeNull();
  });

  it('rejects NaN, infinity, JSON overflow and sparse numeric arrays', () => {
    const storage = new MemoryStorage();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      const game = fixture();
      game.npcs[0].energy = bad;
      expect(saveGame(game, storage)).toBe(false);
    }
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 1, state: fixture() }).replace('"fire":74.5', '"fire":1e400'));
    expect(loadGameWithStatus(storage).status).toBe('invalid');
    const sparse = fixture();
    sparse.decisions[0].scores = new Array(8);
    expect(saveGame(sparse, storage)).toBe(false);
  });

  it('rejects unexpected object fields instead of feeding them into the engine', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ version: 1, savedAt: 1, state: fixture() })
      .replace('"priority":"wood"', '"priority":"wood","__proto__":{"polluted":true}');
    storage.setItem(SAVE_KEY, raw);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('bounds histories, strings and serialized volume without overwriting a good save', () => {
    const storage = new MemoryStorage();
    expect(saveGame(fixture(), storage)).toBe(true);
    const good = storage.getItem(SAVE_KEY);
    const tooManyEvents = fixture();
    tooManyEvents.events = Array.from({ length: SAVE_LIMITS.events + 1 }, (_, id) => ({ id, time: 1, kind: 'info', text: '雨声' }));
    tooManyEvents.nextEventId = 999;
    expect(saveGame(tooManyEvents, storage)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(good);
    writeRaw(storage, tooManyEvents);
    expect(loadGameWithStatus(storage).status).toBe('invalid');

    const tooManyDecisions = fixture();
    tooManyDecisions.decisions = Array.from({ length: SAVE_LIMITS.decisions + 1 }, (_, id) => ({ ...tooManyDecisions.decisions[0], id }));
    tooManyDecisions.nextDecisionId = 999;
    writeRaw(storage, tooManyDecisions);
    expect(loadGameWithStatus(storage).status).toBe('invalid');

    const tooLong = fixture();
    tooLong.events[0].text = 'a'.repeat(1_001);
    writeRaw(storage, tooLong);
    expect(loadGameWithStatus(storage).status).toBe('invalid');
    storage.setItem(SAVE_KEY, ' '.repeat(SAVE_LIMITS.characters + 1));
    expect(loadGameWithStatus(storage).status).toBe('invalid');
  });

  it('treats storage denial, quota exhaustion and failed cleanup as recoverable', () => {
    const denied: SaveStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    expect(saveGame(fixture(), denied)).toBe(false);
    expect(loadGameWithStatus(denied).status).toBe('unavailable');
    expect(loadGame(denied)).toBeNull();
    expect(clearSave(denied)).toBe(false);
    expect(loadGameWithStatus({ ...denied, getItem: () => 'broken' }).status).toBe('invalid');

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Access denied'); } });
    try {
      expect(saveGame(fixture())).toBe(false);
      expect(loadGameWithStatus().status).toBe('unavailable');
      expect(clearSave()).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('safely handles an absent browser storage API and validators with throwing getters', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadGame()).toBeNull();
    const game = fixture();
    Object.defineProperty(game, 'wood', { get: () => { throw new Error('broken property'); } });
    expect(isValidGameState(game)).toBe(false);
    expect(saveGame(game, new MemoryStorage())).toBe(false);
  });
});
