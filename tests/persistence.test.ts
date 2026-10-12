import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS } from '../src/game/types';
import type { GameState, Npc, NpcId, PolicyFunction } from '../src/game/types';
import { advanceGame, createGame, issueCommand } from '../src/game/engine';
import {
  clearSave, isValidGameState, loadGame, loadGameWithStatus, saveGame, SAVE_KEY, SAVE_LIMITS,
} from '../src/game/persistence';
import type { SaveStorage } from '../src/game/persistence';

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
    health: 93, energy: 72, hunger: 31, morale: 68, trust: 84, fear: 12,
    position: { x: 23 + index * 8, y: 42 }, destination: { x: 52, y: 60 },
    action: 'wood', command: index === 0 ? 'wood' : null,
    progress: 0.4, actionDuration: 6, decisionIn: 1.2, emotion: 'calm',
    speech: '再找一些干木头。', speechUntil: 76, injured: false, alive: true,
    inventory: { wood: 3, food: 0 }, completedTasks: 7, refusals: 1, lastInteraction: 35,
  });
  return {
    version: 1, seed: 7315, randomState: 4294923111, status: 'playing',
    difficulty: 'normal', scenario: 'storm', mode: 'model', elapsed: 73.5, duration: 240, day: 1,
    wood: 14, food: 9, fire: 74.5, weather: 'rain', danger: 32, weatherUntil: 89,
    npcs: [person('azhuang', 0), person('xiaomi', 1), person('laozhou', 2)],
    events: [
      { id: 15, time: 72, kind: 'warning', text: '雨还没有停。' },
      { id: 14, time: 70, kind: 'good', text: '阿壮带回了木材。', npcId: 'azhuang' },
    ],
    decisions: [{
      id: 28, time: 71, npcId: 'azhuang', source: 'model', action: 'wood', emotion: 'calm',
      scores: ACTIONS.map((_, index) => index === 0 ? 0.72 : 0.04),
      features: Array.from({ length: 36 }, (_, index) => index / 36),
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

afterEach(() => vi.unstubAllGlobals());

describe('versioned local save', () => {
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
