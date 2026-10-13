import type { MindState } from './types';
import { CONCERN_KINDS, EVENT_TYPES, EXPRESSION_KINDS, INTENTS, MAX_CONCERNS, MAX_MEMORIES, TONES } from './runtime';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: RecordValue, required: string[], optional: string[] = []): boolean => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value: unknown, max: number, min = 0): value is string => typeof value === 'string' && value.length >= min && value.length <= max;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const unit = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1;
const time = (value: unknown): value is number => finite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const integer = (value: unknown, min = 0): value is number => finite(value) && Number.isSafeInteger(value) && value >= min;
const oneOf = (value: unknown, values: readonly string[]): boolean => typeof value === 'string' && values.includes(value);

/**
 * 存档边界严格验证。拒绝未知字段和未来版本，不在这里静默修复损坏数据；
 * 宿主负责区分旧存档迁移与未知新版本的保留策略。本函数不抛异常、不修改输入。
 */
function validateMindState(value: unknown): value is MindState {
  if (!object(value) || !keys(value, ['version', 'npcId', 'revision', 'updatedAt', 'lastEventSequence', 'nextConcernId', 'randomState', 'emotions', 'concerns', 'memories', 'intent', 'expression', 'effort'], ['reconciliation'])) return false;
  if (value.version !== 1 || !text(value.npcId, 100, 1) || !integer(value.revision) || !time(value.updatedAt) || !integer(value.lastEventSequence) || !integer(value.nextConcernId, 1) || !integer(value.randomState) || value.randomState > 0xffffffff || !unit(value.effort)) return false;
  if (value.reconciliation !== undefined) {
    const stage = value.reconciliation;
    if (!object(stage) || !keys(stage, ['grievanceRevision', 'apologyRevision'])
      || !integer(stage.grievanceRevision) || !integer(stage.apologyRevision)
      || stage.apologyRevision > stage.grievanceRevision || stage.grievanceRevision > value.lastEventSequence) return false;
  }
  if (!object(value.emotions) || !keys(value.emotions, ['anger', 'resentment', 'stress']) || !Object.values(value.emotions).every(unit)) return false;
  if (!Array.isArray(value.concerns) || value.concerns.length > MAX_CONCERNS || !Array.isArray(value.memories) || value.memories.length > MAX_MEMORIES) return false;
  const concernIds = new Set<number>();
  const activeKinds = new Set<unknown>();
  for (const concern of value.concerns) {
    if (!object(concern) || !keys(concern, ['id', 'kind', 'status', 'openedAt', 'updatedAt', 'resolvedAt', 'denials', 'severity'])) return false;
    if (!integer(concern.id, 1) || concern.id >= value.nextConcernId || concernIds.has(concern.id) || !oneOf(concern.kind, CONCERN_KINDS) || !oneOf(concern.status, ['open', 'granted', 'resolved']) || !time(concern.openedAt) || !time(concern.updatedAt) || concern.updatedAt < concern.openedAt || concern.updatedAt > value.updatedAt || !integer(concern.denials) || !unit(concern.severity)) return false;
    if (concern.status === 'resolved' ? !time(concern.resolvedAt) || concern.resolvedAt < concern.openedAt || concern.resolvedAt > concern.updatedAt : concern.resolvedAt !== null) return false;
    if (concern.status !== 'resolved' && activeKinds.has(concern.kind)) return false;
    if (concern.status !== 'resolved') activeKinds.add(concern.kind);
    concernIds.add(concern.id);
  }
  let previousSequence = 0;
  for (const memory of value.memories) {
    if (!object(memory) || !keys(memory, ['sequence', 'at', 'type', 'fact', 'salience'], ['actorId', 'concern'])) return false;
    if (!integer(memory.sequence, 1) || memory.sequence <= previousSequence || memory.sequence > value.lastEventSequence || !time(memory.at) || memory.at > value.updatedAt || !oneOf(memory.type, EVENT_TYPES) || !text(memory.fact, 280) || !unit(memory.salience) || memory.actorId !== undefined && !text(memory.actorId, 100, 1) || memory.concern !== undefined && !oneOf(memory.concern, CONCERN_KINDS)) return false;
    previousSequence = memory.sequence;
  }
  const intent = value.intent;
  if (!object(intent) || !keys(intent, ['kind', 'since', 'until', 'actionId', 'reason']) || !oneOf(intent.kind, INTENTS) || !time(intent.since) || intent.since > value.updatedAt || !time(intent.until) || intent.until < intent.since || intent.actionId !== null && !text(intent.actionId, 100, 1) || !text(intent.reason, 280)) return false;
  const expression = value.expression;
  if (!object(expression) || !keys(expression, ['kind', 'tone', 'reason', 'allowDeception', 'revision'], ['concern']) || !oneOf(expression.kind, EXPRESSION_KINDS) || !oneOf(expression.tone, TONES) || !text(expression.reason, 280) || typeof expression.allowDeception !== 'boolean' || !integer(expression.revision) || expression.revision > value.revision || expression.concern !== undefined && !oneOf(expression.concern, CONCERN_KINDS)) return false;
  // 掩饰许可必须与显式 conceal 计划一致，不能用坏存档给正常陈述暗开撒谎权限。
  return !expression.allowDeception || expression.kind === 'conceal';
}

/** 宿主也可能传入带 getter/Proxy 的对象；公开边界一律返回 false，不向外抛读取异常。 */
export function isValidMindState(value: unknown): value is MindState {
  try { return validateMindState(value); }
  catch { return false; }
}
