import { ACTIONS, EMOTIONS, NPC_IDS } from './types';
import type { GameState, Point } from './types';
import { NAVIGATION_CLEARANCE, NPC_RADIUS, TERRAIN } from './terrain';
import { createNpc, LOCATIONS } from './constants';
import { createSocialState, SOCIAL_LIMITS } from './social';
import { SOCIAL_KINDS } from './social-types';
import { findRoute, projectToWalkable } from './physics';
import { createAtmosphere, initialWeatherDelay, WEATHER_KINDS } from './weather';
import { configuredCampRole, isValidCampInitialSettings } from '../settings/runtime';
import { isValidMindState } from '../../../../packages/npc-core/src';

/** The v1 envelope stays stable; old simulation fields migrate explicitly on load. */
export const SAVE_KEY = 'campmind-save-v1';
export const SAVE_LIMITS = Object.freeze({
  characters: 1_000_000,
  events: 80,
  decisions: 180,
  features: 41,
  legacyFeatures: 36,
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

const LEGACY_NPC_IDS = ['azhuang', 'xiaomi', 'laozhou'] as const;
type SaveSchema = 'current' | 'weather3' | 'legacy3';
const CONTACT_IDS = [...TERRAIN.map(object => object.id), ...NPC_IDS, 'boundary'];
const LEGACY_CONTACT_IDS = [...TERRAIN.map(object => object.id), ...LEGACY_NPC_IDS, 'boundary'];
const REACTION_KINDS = ['burn', 'thorns', 'impact', 'water', 'bump'] as const;
const DECISION_TRIGGERS = ['routine', 'weather', 'thunder', 'needs', 'command', 'social'] as const;
const LEGACY_DECISION_TRIGGERS = ['routine', 'weather', 'thunder', 'needs', 'command'] as const;
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

function atmosphere(value: unknown, elapsed: number): boolean {
  if (!object(value) || !keys(value, ['windStrength', 'windAngle', 'rainIntensity', 'cloudCover', 'stormRisk',
    'lightningAt', 'lightningPoint', 'nextLightningAt', 'revision'])) return false;
  if (!['windStrength', 'rainIntensity', 'cloudCover', 'stormRisk'].every(key => number(value[key], 0, 1))
    || !number(value.windAngle, -Math.PI * 2, Math.PI * 2)
    || !number(value.nextLightningAt, 0, SAVE_LIMITS.timer) || !integer(value.revision, 0, 1_000_000)) return false;
  return value.lightningAt === -1 ? value.lightningPoint === null
    : number(value.lightningAt, 0, elapsed) && point(value.lightningPoint);
}

function weatherSnapshot(value: unknown): boolean {
  return object(value) && keys(value, ['kind', 'windStrength', 'rainIntensity', 'stormRisk', 'wetness', 'exposure', 'shelterIntegrity', 'shelterDistance'])
    && member(value.kind, WEATHER_KINDS)
    && ['windStrength', 'rainIntensity', 'stormRisk', 'exposure'].every(key => number(value[key], 0, 1))
    && number(value.wetness, 0, 100) && number(value.shelterIntegrity, 0, 100)
    && number(value.shelterDistance, 0, Math.SQRT2 * 100);
}

function collision(value: unknown, elapsed: number, contactIds: readonly string[]): boolean {
  if (!object(value) || !keys(value, ['hurtUntil', 'reactionUntil', 'objectCooldowns'], ['lastHit'])
    || !number(value.hurtUntil, 0, SAVE_LIMITS.timer) || !number(value.reactionUntil, 0, SAVE_LIMITS.timer)
    || !object(value.objectCooldowns) || Object.keys(value.objectCooldowns).length > contactIds.length
    || !Object.entries(value.objectCooldowns).every(([id, until]) => contactIds.includes(id) && number(until, 0, SAVE_LIMITS.timer))) return false;
  if (value.lastHit === undefined) return true;
  const hit = value.lastHit;
  return object(hit) && keys(hit, ['kind', 'objectId', 'time', 'intensity', 'damage'])
    && member(hit.kind, REACTION_KINDS) && member(hit.objectId, contactIds)
    && number(hit.time, 0, elapsed) && number(hit.intensity, 0, 1) && number(hit.damage, 0, 100);
}

function reaction(value: unknown, contactIds: readonly string[]): boolean {
  return object(value) && keys(value, ['kind', 'objectId', 'intensity', 'utterance'])
    && member(value.kind, REACTION_KINDS) && member(value.objectId, contactIds)
    && number(value.intensity, 0, 1) && string(value.utterance, 400, 1);
}

function npc(value: unknown, elapsed: number, schema: SaveSchema): boolean {
  const legacy = schema === 'legacy3';
  const ids = schema === 'current' ? NPC_IDS : LEGACY_NPC_IDS;
  if (!object(value) || !keys(value, legacy ? NPC_KEYS : [...NPC_KEYS, 'wetness'],
    legacy ? ['manualTarget', 'collision', 'mind', 'actionEffort', 'initialSettings'] : ['manualTarget', 'collision', 'decisionTrigger', 'previousAction', 'mind', 'actionEffort', 'initialSettings'])) return false;
  if (!member(value.id, ids) || !string(value.name, 40, 1)
    || !string(value.role, 80) || !string(value.color, 64, 1)) return false;
  // 无 mind 是受支持的旧档；一旦存在，必须完整通过通用校验和营地绑定校验。
  // 不能用“校验失败就补默认值”掩盖损坏，否则读档会悄悄抹去拒绝与怨恨。
  if (value.mind !== undefined && (!isValidMindState(value.mind)
    || value.mind.npcId !== value.id || value.mind.updatedAt > elapsed
    || value.mind.intent.since > elapsed || !action(value.mind.intent.actionId)
    || value.mind.memories.some(memory => memory.at > elapsed)
    || value.mind.concerns.some(concern => concern.openedAt > elapsed || concern.updatedAt > elapsed
      || (concern.resolvedAt !== null && concern.resolvedAt > elapsed)))) return false;
  if (value.initialSettings !== undefined && !isValidCampInitialSettings(value.initialSettings)) return false;
  if (value.actionEffort !== undefined && !number(value.actionEffort, .1, 1)) return false;
  if (!object(value.personality) || !keys(value.personality, ['bravery', 'diligence', 'empathy'])
    || !Object.values(value.personality).every(item => number(item, 0, 1))) return false;
  if (!['health', 'energy', 'hunger', 'morale', 'trust', 'fear'].every(key => number(value[key], 0, 100))) return false;
  if (!legacy && !number(value.wetness, 0, 100)) return false;
  if (!point(value.position) || !point(value.destination) || !action(value.action) || !action(value.command)) return false;
  if ((value.manualTarget !== undefined && !point(value.manualTarget))
    || (value.collision !== undefined && !collision(value.collision, elapsed, schema === 'current' ? CONTACT_IDS : LEGACY_CONTACT_IDS))
    || (value.decisionTrigger !== undefined && !member(value.decisionTrigger, schema === 'current' ? DECISION_TRIGGERS : LEGACY_DECISION_TRIGGERS))
    || (value.previousAction !== undefined && !action(value.previousAction))) return false;
  if (!number(value.progress, 0, 1) || !number(value.actionDuration, 0, SAVE_LIMITS.timer)
    || !number(value.decisionIn, 0, SAVE_LIMITS.timer) || !number(value.speechUntil, 0, SAVE_LIMITS.timer)
    || !number(value.lastInteraction, 0, SAVE_LIMITS.timer)) return false;
  if (!member(value.emotion, EMOTIONS) || !string(value.speech, 400)
    || typeof value.injured !== 'boolean' || typeof value.alive !== 'boolean') return false;
  if (!object(value.inventory) || !keys(value.inventory, ['wood', 'food'])
    || !integer(value.inventory.wood, 0, 6) || !integer(value.inventory.food, 0, 4)) return false;
  return integer(value.completedTasks, 0, 100_000) && integer(value.refusals, 0, 100_000);
}

function event(value: unknown, elapsed: number, schema: SaveSchema): boolean {
  const ids = schema === 'current' ? NPC_IDS : LEGACY_NPC_IDS;
  return object(value) && keys(value, ['id', 'time', 'kind', 'text'], ['npcId', 'reaction'])
    && integer(value.id, 0, 1_000_000) && number(value.time, 0, elapsed)
    && member(value.kind, ['info', 'good', 'warning', 'danger']) && string(value.text, 1_000)
    && (value.npcId === undefined || member(value.npcId, ids))
    && (value.reaction === undefined || (member(value.npcId, ids) && reaction(value.reaction, schema === 'current' ? CONTACT_IDS : LEGACY_CONTACT_IDS)));
}

function decision(value: unknown, elapsed: number, schema: SaveSchema): boolean {
  const legacy = schema === 'legacy3';
  const ids = schema === 'current' ? NPC_IDS : LEGACY_NPC_IDS;
  if (!object(value) || !keys(value,
    ['id', 'time', 'npcId', 'source', 'action', 'emotion', 'scores', 'features', 'allowed', 'latencyMs', 'accepted'],
    ['reason', 'featureVersion', 'trigger', 'previousAction', 'weather'])) return false;
  if (!integer(value.id, 0, 1_000_000) || !number(value.time, 0, elapsed)
    || !member(value.npcId, ids) || !member(value.source, ['model', 'rules', 'fallback'])
    || !member(value.action, ACTIONS) || !member(value.emotion, EMOTIONS)) return false;
  if (!Array.isArray(value.scores) || value.scores.length !== ACTIONS.length
    || !Array.from(value.scores).every(item => number(item, -1_000_000, 1_000_000))) return false;
  if (!Array.isArray(value.features) || !Array.from(value.features).every(item => number(item, 0, 1))) return false;
  const legacyFeatures = value.features.length === SAVE_LIMITS.legacyFeatures
    && (value.featureVersion === undefined || value.featureVersion === 1);
  const currentFeatures = value.features.length === SAVE_LIMITS.features && value.featureVersion === 2;
  if (!legacyFeatures && (legacy || !currentFeatures)) return false;
  if ((value.trigger !== undefined && !member(value.trigger, schema === 'current' ? DECISION_TRIGGERS : LEGACY_DECISION_TRIGGERS))
    || (value.previousAction !== undefined && !action(value.previousAction))
    || (value.weather !== undefined && (!currentFeatures || !weatherSnapshot(value.weather)))) return false;
  if (!Array.isArray(value.allowed) || value.allowed.length < 1 || value.allowed.length > ACTIONS.length
    || !Array.from(value.allowed).every(item => member(item, ACTIONS)) || new Set(value.allowed).size !== value.allowed.length) return false;
  return number(value.latencyMs, 0, 60_000) && typeof value.accepted === 'boolean'
    && (value.reason === undefined || string(value.reason, 1_000));
}

/** Social history has separate counters; pruned threads remain valid historical references. */
function social(value: unknown, elapsed: number): boolean {
  if (!object(value) || !keys(value, ['version', 'revision', 'nextId', 'nextLineId', 'nextCheckAt', 'nextPromptAt',
    'introduced', 'people', 'threads', 'memories', 'promises', 'agreements', 'relationships', 'stats'])
    || value.version !== 1 || !integer(value.revision, 0, 1_000_000)
    || !integer(value.nextId, 1, 1_000_000) || !integer(value.nextLineId, 1, 1_000_000)
    || !number(value.nextCheckAt, 0, SAVE_LIMITS.timer) || !number(value.nextPromptAt, 0, SAVE_LIMITS.timer)
    || typeof value.introduced !== 'boolean' || !object(value.people) || !keys(value.people, NPC_IDS)) return false;
  if (!Object.values(value.people).every(person => object(person) && keys(person, ['workload', 'resentment', 'cooldownUntil'], ['lastConcernPrompts'])
    && number(person.workload, 0, 100) && number(person.resentment, 0, 100)
    && number(person.cooldownUntil, 0, SAVE_LIMITS.timer)
    && (person.lastConcernPrompts === undefined || (object(person.lastConcernPrompts)
      && keys(person.lastConcernPrompts, [], ['rest', 'food', 'fairness', 'safety'])
      && Object.values(person.lastConcernPrompts).every(id => integer(id, 0, 1_000_000)))))) return false;
  const ids = new Set<number>();
  const lineIds = new Set<number>();
  const historyId = (id: unknown): id is number => {
    if (!integer(id, 1, (value.nextId as number) - 1) || ids.has(id)) return false;
    ids.add(id);
    return true;
  };
  const threadRef = (id: unknown) => integer(id, 1, (value.nextId as number) - 1);
  if (!Array.isArray(value.threads) || value.threads.length > SOCIAL_LIMITS.threads
    || !Array.from(value.threads).every(thread => {
      if (!object(thread) || !keys(thread, ['id', 'kind', 'initiator', 'participants', 'title', 'prompt', 'createdAt',
        'expiresAt', 'status', 'revision', 'lines', 'choiceId', 'resolution']) || !historyId(thread.id)
        || !member(thread.kind, SOCIAL_KINDS) || !member(thread.initiator, NPC_IDS)
        || !Array.isArray(thread.participants) || !thread.participants.length || thread.participants.length > NPC_IDS.length
        || !Array.from(thread.participants).every(id => member(id, NPC_IDS))
        || new Set(thread.participants).size !== thread.participants.length || !thread.participants.includes(thread.initiator)
        || !string(thread.title, SOCIAL_LIMITS.text, 1) || !string(thread.prompt, SOCIAL_LIMITS.text)
        || !number(thread.createdAt, 0, elapsed) || !number(thread.expiresAt, thread.createdAt as number, SAVE_LIMITS.timer)
        || !member(thread.status, ['open', 'resolved', 'expired']) || !integer(thread.revision, 0, 1_000_000)
        || !(thread.choiceId === null || string(thread.choiceId, 80, 1)) || !string(thread.resolution, SOCIAL_LIMITS.text)
        || !Array.isArray(thread.lines) || thread.lines.length > SOCIAL_LIMITS.lines) return false;
      return Array.from(thread.lines).every(line => {
        if (!object(line) || !keys(line, ['id', 'speaker', 'text', 'at', 'source'])
          || !integer(line.id, 1, (value.nextLineId as number) - 1) || lineIds.has(line.id)
          || !(line.speaker === 'player' || member(line.speaker, thread.participants as typeof NPC_IDS[number][]))
          || !string(line.text, SOCIAL_LIMITS.text, 1) || !number(line.at, thread.createdAt as number, elapsed)
          || !member(line.source, ['template', 'minimind3', 'cache', 'player'])
          || ((line.speaker === 'player') !== (line.source === 'player'))) return false;
        lineIds.add(line.id);
        return true;
      });
    })) return false;
  if (!Array.isArray(value.memories) || value.memories.length > SOCIAL_LIMITS.memories
    || !Array.from(value.memories).every(memory => object(memory)
      && keys(memory, ['id', 'npcId', 'threadId', 'at', 'kind', 'text'], ['otherId']) && historyId(memory.id)
      && member(memory.npcId, NPC_IDS) && (memory.otherId === undefined || member(memory.otherId, NPC_IDS))
      && threadRef(memory.threadId) && number(memory.at, 0, elapsed)
      && member(memory.kind, ['agreement', 'promise_kept', 'promise_broken', 'help', 'choice', 'ignored'])
      && string(memory.text, SOCIAL_LIMITS.text, 1))) return false;
  if (!Array.isArray(value.promises) || value.promises.length > SOCIAL_LIMITS.promises
    || !Array.from(value.promises).every(promise => object(promise)
      && keys(promise, ['id', 'npcId', 'threadId', 'kind', 'createdAt', 'dueAt', 'status', 'fulfilledAt'])
      && historyId(promise.id) && member(promise.npcId, NPC_IDS) && threadRef(promise.threadId)
      && member(promise.kind, ['meal', 'rest']) && number(promise.createdAt, 0, elapsed)
      && number(promise.dueAt, promise.createdAt as number, SAVE_LIMITS.timer)
      && member(promise.status, ['pending', 'kept', 'broken', 'cancelled'])
      && (promise.status === 'kept' ? number(promise.fulfilledAt, promise.createdAt as number, elapsed) : promise.fulfilledAt === null))) return false;
  if (!Array.isArray(value.agreements) || value.agreements.length > SOCIAL_LIMITS.agreements
    || !Array.from(value.agreements).every(agreement => object(agreement)
      && keys(agreement, ['id', 'npcId', 'threadId', 'action', 'createdAt', 'until'], ['targetId'])
      && historyId(agreement.id) && member(agreement.npcId, NPC_IDS) && threadRef(agreement.threadId)
      && member(agreement.action, ACTIONS) && (agreement.targetId === undefined || member(agreement.targetId, NPC_IDS))
      && number(agreement.createdAt, 0, elapsed) && number(agreement.until, agreement.createdAt as number, SAVE_LIMITS.timer))) return false;
  if (new Set(value.agreements.map(agreement => agreement.npcId)).size !== value.agreements.length) return false;
  if (!Array.isArray(value.relationships) || value.relationships.length !== NPC_IDS.length * (NPC_IDS.length - 1)) return false;
  const pairs = new Set<string>();
  if (!Array.from(value.relationships).every(relationship => {
    if (!object(relationship) || !keys(relationship, ['from', 'to', 'affinity'])
      || !member(relationship.from, NPC_IDS) || !member(relationship.to, NPC_IDS) || relationship.from === relationship.to
      || !number(relationship.affinity, 0, 100)) return false;
    const pair = `${relationship.from}:${relationship.to}`;
    if (pairs.has(pair)) return false;
    pairs.add(pair);
    return true;
  })) return false;
  return object(value.stats) && keys(value.stats, ['initiated', 'replied', 'resolved', 'ignored', 'kept', 'broken'])
    && Object.values(value.stats).every(stat => integer(stat, 0, 1_000_000));
}

function validateGameState(value: unknown, schema: SaveSchema = 'current'): value is GameState {
  const legacy = schema === 'legacy3';
  const ids = schema === 'current' ? NPC_IDS : LEGACY_NPC_IDS;
  try {
    const stateKeys = legacy ? STATE_KEYS : [...STATE_KEYS, 'atmosphere', 'shelterIntegrity', ...(schema === 'current' ? ['social'] : [])];
    if (!object(value) || !keys(value, stateKeys) || value.version !== 1) return false;
    if (!integer(value.seed, 0, 0xffffffff) || !integer(value.randomState, 0, 0xffffffff)) return false;
    if (!member(value.status, ['ready', 'playing', 'paused', 'won', 'lost'])
      || !member(value.difficulty, ['cozy', 'normal', 'hard'])
      || !member(value.scenario, ['standard', 'storm', 'conflict'])
      || !member(value.mode, ['model', 'rules'])) return false;
    if (value.duration !== 240 || !number(value.elapsed, 0, value.duration) || !integer(value.day, 1, 100_000)) return false;
    if (!integer(value.wood, 0, SAVE_LIMITS.resource) || !integer(value.food, 0, SAVE_LIMITS.resource)
      || !number(value.fire, 0, 100) || !number(value.danger, 0, 100)
      || !member(value.weather, legacy ? ['clear', 'rain', 'wind'] : WEATHER_KINDS)) return false;
    if (!legacy && (!atmosphere(value.atmosphere, value.elapsed) || !number(value.shelterIntegrity, 0, 100))) return false;
    if (!number(value.weatherUntil, 0, SAVE_LIMITS.timer) || !number(value.nextWorldEvent, 0, SAVE_LIMITS.timer)
      || !integer(value.nextEventId, 0, 1_000_000) || !integer(value.nextDecisionId, 0, 1_000_000)) return false;
    if (!member(value.selectedNpc, ids) || !member(value.priority, ['balanced', 'wood', 'food'])) return false;
    if (!Array.isArray(value.npcs) || value.npcs.length !== ids.length || !Array.from(value.npcs).every(item => npc(item, value.elapsed as number, schema))) return false;
    if (new Set(value.npcs.map(item => item.id)).size !== ids.length) return false;
    if (!Array.isArray(value.events) || value.events.length > SAVE_LIMITS.events
      || !Array.from(value.events).every(item => event(item, value.elapsed as number, schema))) return false;
    if (!Array.isArray(value.decisions) || value.decisions.length > SAVE_LIMITS.decisions
      || !Array.from(value.decisions).every(item => decision(item, value.elapsed as number, schema))) return false;
    if (new Set(value.events.map(item => item.id)).size !== value.events.length
      || new Set(value.decisions.map(item => item.id)).size !== value.decisions.length) return false;
    if (value.events.some(item => item.id >= (value.nextEventId as number))
      || value.decisions.some(item => item.id >= (value.nextDecisionId as number))) return false;
    if (!object(value.stats) || !keys(value.stats, STAT_KEYS)
      || !Object.values(value.stats).every(item => number(item, 0, 1_000_000_000))) return false;
    if (schema === 'current' && !social(value.social, value.elapsed as number)) return false;
    // 事件序号和社交事件共用宿主单调计数器；越过计数器会让后续真实事件被当作重复。
    if (schema === 'current' && value.npcs.some(person => person.mind
      && person.mind.lastEventSequence >= (value.social as GameState['social']).nextId)) return false;
    return string(value.resultReason, 1_000) && number(value.score, 0, 10_000_000);
  } catch {
    // A storage adapter or caller may expose getters/proxies that throw.
    return false;
  }
}

/** Validates current in-memory state before the game or policy consumes it. */
export function isValidGameState(value: unknown): value is GameState {
  return validateGameState(value);
}

/** Old river endpoints were crossable; reconnect only legacy coordinates the new creek strands. */
function reconcileLegacyTerrain(state: GameState): void {
  const creek = TERRAIN.find(object => object.id === 'deep-creek');
  if (!creek || creek.shape.type !== 'aabb') return;
  const { center, half } = creek.shape;
  const padding = NPC_RADIUS + NAVIGATION_CLEARANCE + (creek.hazard?.reach ?? 0);
  const camp = projectToWalkable(LOCATIONS.camp, true, undefined, NAVIGATION_CLEARANCE);
  const campSide = Math.sign(camp.x - center.x) || -1;
  const connected = (point: Point) => {
    // Test from the final projection: findRoute may otherwise return just a local repair step.
    const start = projectToWalkable(point, true, camp, NAVIGATION_CLEARANCE);
    return findRoute(start, camp).length > 0;
  };
  const reconcile = (point: Point): Point => {
    const submerged = Math.abs(point.x - center.x) <= half.x + padding
      && Math.abs(point.y - center.y) <= half.y + padding;
    if (!submerged && connected(point)) return point;
    // Leave a full navigation clearance beyond the river margin, including endpoint sweeps.
    const bank = projectToWalkable({
      x: center.x + campSide * (half.x + padding + NAVIGATION_CLEARANCE), y: point.y,
    }, true, camp, NAVIGATION_CLEARANCE);
    return connected(bank) ? bank : { ...camp };
  };
  const adjusted: string[] = [];
  for (const person of state.npcs) {
    const position = reconcile(person.position);
    let destination = reconcile(person.destination);
    const manualTarget = person.manualTarget ? reconcile(person.manualTarget) : undefined;
    const manualChanged = manualTarget !== person.manualTarget;
    if (manualChanged && manualTarget) destination = { ...manualTarget };
    if (position !== person.position || destination !== person.destination || manualChanged) adjusted.push(person.name);
    person.position = position;
    person.destination = destination;
    if (manualTarget) person.manualTarget = manualTarget;
  }
  if (adjusted.length && state.nextEventId < 1_000_000) {
    state.events.push({ id: state.nextEventId++, time: state.elapsed, kind: 'info',
      text: `河道更新，已将${adjusted.join('、')}受影响的位置或路线移到营地一侧的安全河岸。` });
    if (state.events.length > SAVE_LIMITS.events) state.events.splice(0, state.events.length - SAVE_LIMITS.events);
  }
}

function restoreGameState(value: unknown): GameState | null {
  const current = validateGameState(value);
  const weather3 = !current && validateGameState(value, 'weather3');
  const legacy3 = !current && !weather3 && validateGameState(value, 'legacy3');
  if (!current && !weather3 && !legacy3) return null;
  const state = structuredClone(value) as GameState;
  if (legacy3) {
    state.atmosphere = createAtmosphere(state.seed, state.weather, state.elapsed);
    state.shelterIntegrity = 100;
    for (const person of state.npcs) person.wetness = 0;
    if (state.weatherUntil <= state.elapsed) state.weatherUntil = state.elapsed + (state.weather === 'clear' ? initialWeatherDelay(state.seed) : 24);
    reconcileLegacyTerrain(state);
  }
  if (!current) {
    state.npcs.push(createNpc('linlan', state.elapsed), createNpc('aye', state.elapsed));
    state.social = createSocialState(state.npcs, state.elapsed);
    state.social.introduced = state.elapsed > 0;
  }
  for (const person of state.npcs) {
    const profile = createNpc(person.id, state.elapsed, state.scenario);
    // 人物配置属于游戏版本，不能由旧存档锁死；身体、物资、对话与真实历史则保持原样。
    // linlan 是稳定兼容 ID，当前显示名为林枫，不全局替换历史中的玩家原话。
    person.name = profile.name; person.role = configuredCampRole(person); person.color = profile.color;
    // 自定义新档保留这局已经保存的模型投影；不能按最新默认值重算，更不能重放体力或情绪。
    if (!person.initialSettings) person.personality = { ...profile.personality };
    if (!person.mind) person.mind = profile.mind;
  }
  // Historical inputs stay byte-for-byte equivalent: never invent five past weather observations.
  for (const record of state.decisions) if (record.featureVersion === undefined) record.featureVersion = 1;
  return validateGameState(state) ? state : null;
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
      || (object(snapshot.state) && (integer(snapshot.state.version, 2, 10_000)
        || (Array.isArray(snapshot.state.npcs) && snapshot.state.npcs.some(person => object(person)
          && ((object(person.mind) && integer(person.mind.version, 2, 10_000))
            || (object(person.initialSettings) && integer(person.initialSettings.schemaVersion, 2, 10_000)))))))) {
      return { state: null, status: 'unsupported', message: '这份进度来自其他游戏版本，可以开始新一局。' };
    }
    if (!keys(snapshot, ['version', 'savedAt', 'state']) || snapshot.version !== 1
      || !integer(snapshot.savedAt, 0, 8_640_000_000_000_000)) return invalid();
    const state = restoreGameState(snapshot.state);
    if (!state) return invalid();
    return {
      state: { ...state, status: state.status === 'playing' ? 'paused' : state.status },
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