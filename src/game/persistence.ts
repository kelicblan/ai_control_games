import { ACTIONS, EMOTIONS } from './types';
import type { GameState } from './types';
import { TERRAIN } from './terrain';

/** Keep this key/version stable until a deliberate save migration is added. */
export const SAVE_KEY = 'campmind-save-v1';
export const SAVE_LIMITS = Object.freeze({
  characters: 1_000_000,
  events: 80,
  decisions: 180,
  features: 36,
  resource: 100,
  timer: 3_600,
});

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LoadStatus = 'restored' | 'missing' | 'invalid' | 'unsupported' | 'unavailable';
export interface LoadResult {
  state: GameState | null;
  status: LoadStatus;
  message: string;
  savedAt?: number;
}

interface SavedGame {
  version: 1;
  savedAt: number;
  state: GameState;
}

const NPC_IDS = ['azhuang', 'xiaomi', 'laozhou'] as const;
const CONTACT_IDS = [...TERRAIN.map(object => object.id), ...NPC_IDS, 'boundary'];
const REACTION_KINDS = ['burn', 'thorns', 'impact', 'water', 'bump'] as const;
const STATE_KEYS = [
  'version', 'seed', 'randomState', 'status', 'difficulty', 'scenario', 'mode',
  'elapsed', 'duration', 'day', 'wood', 'food', 'fire', 'weather', 'danger',
  'weatherUntil', 'npcs', 'events', 'decisions', 'selectedNpc', 'priority',
  'nextEventId', 'nextDecisionId', 'nextWorldEvent', 'stats', 'resultReason', 'score',
] as const;
const NPC_KEYS = [
  'id', 'name', 'role', 'color', 'personality', 'health', 'energy', 'hunger',
  'morale', 'trust', 'fear', 'position', 'destination', 'action', 'command',
  'progress', 'actionDuration', 'decisionIn', 'emotion', 'speech', 'speechUntil',
  'injured', 'alive', 'inventory', 'completedTasks', 'refusals', 'lastInteraction',
] as const;
const STAT_KEYS = [
  'gatheredWood', 'gatheredFood', 'meals', 'helps', 'modelDecisions',
  'ruleDecisions', 'fallbackDecisions', 'totalLatency', 'taskSwitches',
] as const;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every(key => allowed.has(key));
}

function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return number(value, min, max) && Number.isInteger(value);
}

function string(value: unknown, max: number, min = 0): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function member<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function action(value: unknown): boolean {
  return value === null || member(value, ACTIONS);
}

function point(value: unknown): boolean {
  return object(value) && keys(value, ['x', 'y'])
    && number(value.x, 0, 100) && number(value.y, 0, 100);
}

function collision(value: unknown, elapsed: number): boolean {
  if (!object(value) || !keys(value, ['hurtUntil', 'reactionUntil', 'objectCooldowns'], ['lastHit'])
    || !number(value.hurtUntil, 0, SAVE_LIMITS.timer) || !number(value.reactionUntil, 0, SAVE_LIMITS.timer)
    || !object(value.objectCooldowns) || Object.keys(value.objectCooldowns).length > CONTACT_IDS.length
    || !Object.entries(value.objectCooldowns).every(([id, until]) => CONTACT_IDS.includes(id) && number(until, 0, SAVE_LIMITS.timer))) return false;
  if (value.lastHit === undefined) return true;
  const hit = value.lastHit;
  return object(hit) && keys(hit, ['kind', 'objectId', 'time', 'intensity', 'damage'])
    && member(hit.kind, REACTION_KINDS) && member(hit.objectId, CONTACT_IDS)
    && number(hit.time, 0, elapsed) && number(hit.intensity, 0, 1) && number(hit.damage, 0, 100);
}

function reaction(value: unknown): boolean {
  return object(value) && keys(value, ['kind', 'objectId', 'intensity', 'utterance'])
    && member(value.kind, REACTION_KINDS) && member(value.objectId, CONTACT_IDS)
    && number(value.intensity, 0, 1) && string(value.utterance, 400, 1);
}

function npc(value: unknown, elapsed: number): boolean {
  if (!object(value) || !keys(value, NPC_KEYS, ['manualTarget', 'collision'])) return false;
  if (!member(value.id, NPC_IDS) || !string(value.name, 40, 1)
    || !string(value.role, 80) || !string(value.color, 64, 1)) return false;
  if (!object(value.personality) || !keys(value.personality, ['bravery', 'diligence', 'empathy'])
    || !Object.values(value.personality).every(item => number(item, 0, 1))) return false;
  if (!['health', 'energy', 'hunger', 'morale', 'trust', 'fear'].every(key => number(value[key], 0, 100))) return false;
  if (!point(value.position) || !point(value.destination) || !action(value.action) || !action(value.command)) return false;
  if ((value.manualTarget !== undefined && !point(value.manualTarget))
    || (value.collision !== undefined && !collision(value.collision, elapsed))) return false;
  if (!number(value.progress, 0, 1) || !number(value.actionDuration, 0, SAVE_LIMITS.timer)
    || !number(value.decisionIn, 0, SAVE_LIMITS.timer) || !number(value.speechUntil, 0, SAVE_LIMITS.timer)
    || !number(value.lastInteraction, 0, SAVE_LIMITS.timer)) return false;
  if (!member(value.emotion, EMOTIONS) || !string(value.speech, 400)
    || typeof value.injured !== 'boolean' || typeof value.alive !== 'boolean') return false;
  if (!object(value.inventory) || !keys(value.inventory, ['wood', 'food'])
    || !integer(value.inventory.wood, 0, 6) || !integer(value.inventory.food, 0, 4)) return false;
  return integer(value.completedTasks, 0, 100_000) && integer(value.refusals, 0, 100_000);
}

function event(value: unknown, elapsed: number): boolean {
  return object(value) && keys(value, ['id', 'time', 'kind', 'text'], ['npcId', 'reaction'])
    && integer(value.id, 0, 1_000_000) && number(value.time, 0, elapsed)
    && member(value.kind, ['info', 'good', 'warning', 'danger']) && string(value.text, 1_000)
    && (value.npcId === undefined || member(value.npcId, NPC_IDS))
    && (value.reaction === undefined || (member(value.npcId, NPC_IDS) && reaction(value.reaction)));
}

function decision(value: unknown, elapsed: number): boolean {
  if (!object(value) || !keys(value,
    ['id', 'time', 'npcId', 'source', 'action', 'emotion', 'scores', 'features', 'allowed', 'latencyMs', 'accepted'],
    ['reason'])) return false;
  if (!integer(value.id, 0, 1_000_000) || !number(value.time, 0, elapsed)
    || !member(value.npcId, NPC_IDS) || !member(value.source, ['model', 'rules', 'fallback'])
    || !member(value.action, ACTIONS) || !member(value.emotion, EMOTIONS)) return false;
  if (!Array.isArray(value.scores) || value.scores.length !== ACTIONS.length
    || !Array.from(value.scores).every(item => number(item, -1_000_000, 1_000_000))) return false;
  if (!Array.isArray(value.features) || value.features.length !== SAVE_LIMITS.features
    || !Array.from(value.features).every(item => number(item, 0, 1))) return false;
  if (!Array.isArray(value.allowed) || value.allowed.length < 1 || value.allowed.length > ACTIONS.length
    || !Array.from(value.allowed).every(item => member(item, ACTIONS)) || new Set(value.allowed).size !== value.allowed.length) return false;
  return number(value.latencyMs, 0, 60_000) && typeof value.accepted === 'boolean'
    && (value.reason === undefined || string(value.reason, 1_000));
}

/** Validates untrusted data before the game or its policy ever sees it. */
export function isValidGameState(value: unknown): value is GameState {
  try {
    if (!object(value) || !keys(value, STATE_KEYS) || value.version !== 1) return false;
    if (!integer(value.seed, 0, 0xffffffff) || !integer(value.randomState, 0, 0xffffffff)) return false;
    if (!member(value.status, ['ready', 'playing', 'paused', 'won', 'lost'])
      || !member(value.difficulty, ['cozy', 'normal', 'hard'])
      || !member(value.scenario, ['standard', 'storm', 'conflict'])
      || !member(value.mode, ['model', 'rules'])) return false;
    if (value.duration !== 240 || !number(value.elapsed, 0, value.duration) || !integer(value.day, 1, 100_000)) return false;
    if (!integer(value.wood, 0, SAVE_LIMITS.resource) || !integer(value.food, 0, SAVE_LIMITS.resource)
      || !number(value.fire, 0, 100) || !number(value.danger, 0, 100)
      || !member(value.weather, ['clear', 'rain', 'wind'])) return false;
    if (!number(value.weatherUntil, 0, SAVE_LIMITS.timer) || !number(value.nextWorldEvent, 0, SAVE_LIMITS.timer)
      || !integer(value.nextEventId, 0, 1_000_000) || !integer(value.nextDecisionId, 0, 1_000_000)) return false;
    if (!member(value.selectedNpc, NPC_IDS) || !member(value.priority, ['balanced', 'wood', 'food'])) return false;
    if (!Array.isArray(value.npcs) || value.npcs.length !== NPC_IDS.length || !Array.from(value.npcs).every(item => npc(item, value.elapsed as number))) return false;
    if (new Set(value.npcs.map(item => item.id)).size !== NPC_IDS.length) return false;
    if (!Array.isArray(value.events) || value.events.length > SAVE_LIMITS.events
      || !Array.from(value.events).every(item => event(item, value.elapsed as number))) return false;
    if (!Array.isArray(value.decisions) || value.decisions.length > SAVE_LIMITS.decisions
      || !Array.from(value.decisions).every(item => decision(item, value.elapsed as number))) return false;
    if (new Set(value.events.map(item => item.id)).size !== value.events.length
      || new Set(value.decisions.map(item => item.id)).size !== value.decisions.length) return false;
    if (value.events.some(item => item.id >= (value.nextEventId as number))
      || value.decisions.some(item => item.id >= (value.nextDecisionId as number))) return false;
    if (!object(value.stats) || !keys(value.stats, STAT_KEYS)
      || !Object.values(value.stats).every(item => number(item, 0, 1_000_000_000))) return false;
    return string(value.resultReason, 1_000) && number(value.score, 0, 10_000_000);
  } catch {
    // A storage adapter or caller may expose getters/proxies that throw.
    return false;
  }
}

function getStorage(storage?: SaveStorage): SaveStorage | null {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function discardInvalid(storage: SaveStorage): void {
  try { storage.removeItem(SAVE_KEY); } catch { /* Reading can work even when writes are blocked. */ }
}

/** False means that the session can continue, but this save was not persisted. */
export function saveGame(state: GameState, storage?: SaveStorage): boolean {
  try {
    const target = getStorage(storage);
    if (!target || !isValidGameState(state)) return false;
    const snapshot: SavedGame = { version: 1, savedAt: Date.now(), state };
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > SAVE_LIMITS.characters) return false;
    target.setItem(SAVE_KEY, serialized);
    return true;
  } catch {
    // QuotaExceededError, SecurityError and serialization failures are recoverable.
    return false;
  }
}

export function loadGameWithStatus(storage?: SaveStorage): LoadResult {
  const target = getStorage(storage);
  if (!target) return { state: null, status: 'unavailable', message: '浏览器暂时无法保存进度，你仍然可以正常游玩。' };

  let serialized: string | null;
  try { serialized = target.getItem(SAVE_KEY); }
  catch { return { state: null, status: 'unavailable', message: '暂时无法读取进度，可以放心开始新一局。' }; }
  if (serialized === null) return { state: null, status: 'missing', message: '' };

  const invalid = (): LoadResult => {
    discardInvalid(target);
    return { state: null, status: 'invalid', message: '旧进度没有完整保存，已为你准备好新的营地。' };
  };
  if (serialized.length > SAVE_LIMITS.characters) return invalid();

  try {
    const snapshot: unknown = JSON.parse(serialized);
    if (!object(snapshot)) return invalid();
    if (integer(snapshot.version, 2, 10_000)
      || (object(snapshot.state) && integer(snapshot.state.version, 2, 10_000))) {
      return { state: null, status: 'unsupported', message: '这份进度来自其他游戏版本，可以开始新一局。' };
    }
    if (!keys(snapshot, ['version', 'savedAt', 'state']) || snapshot.version !== 1
      || !integer(snapshot.savedAt, 0, 8_640_000_000_000_000)
      || !isValidGameState(snapshot.state)) return invalid();
    return {
      state: { ...snapshot.state, status: snapshot.state.status === 'playing' ? 'paused' : snapshot.state.status },
      status: 'restored',
      message: '营地进度已恢复，准备好后再继续。',
      savedAt: snapshot.savedAt,
    };
  } catch {
    return invalid();
  }
}

export function loadGame(storage?: SaveStorage): GameState | null {
  return loadGameWithStatus(storage).state;
}

export function clearSave(storage?: SaveStorage): boolean {
  try {
    const target = getStorage(storage);
    if (!target) return false;
    target.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
