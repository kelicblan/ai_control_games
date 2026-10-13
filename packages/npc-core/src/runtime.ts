import type { ActionOffer, AppraisalDelta, BehaviorDecision, BehaviorIntent, ConcernKind, ExpressionKind, ExpressionTone, MindConcern, MindEvent, MindObservation, MindState, NpcProfile } from './types';

export const MAX_MEMORIES = 32;
export const MAX_CONCERNS = 12;
export const EVENT_TYPES = ['request_denied', 'request_granted', 'promise_broken', 'promise_kept', 'praised', 'urged', 'deception_exposed', 'work_completed', 'help_received', 'peer_protest', 'apologized'] as const;
export const INTENTS = ['cooperate', 'endure', 'bargain', 'evade', 'rest', 'refuse', 'recruit', 'strike'] as const;
export const EXPRESSION_KINDS = ['explanation', 'request', 'bargain', 'complaint', 'refusal', 'conceal', 'recruit'] as const;
export const TONES = ['neutral', 'warm', 'tired', 'irritated', 'angry', 'guarded'] as const;
export const CONCERN_KINDS = ['rest', 'food', 'fairness', 'safety'] as const;
const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finiteTime = (value: number): number => Math.max(0, Number.isFinite(value) ? value : 0);

/** 配置只用于计算，不复制进存档；新游戏可用完全不同的角色 ID 和数值配置。 */
export function createMind(profile: NpcProfile, now = 0, seed = 1): MindState {
  if (!profile.id || profile.id.length > 100 || Object.values(profile.traits).some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError('NPC 标识或性格强度不合法');
  }
  let randomState = seed >>> 0;
  for (const char of profile.id) randomState = (Math.imul(randomState, 31) + char.charCodeAt(0)) >>> 0;
  const at = finiteTime(now);
  return {
    version: 1, npcId: profile.id, revision: 0, updatedAt: at, lastEventSequence: 0,
    reconciliation: { grievanceRevision: 0, apologyRevision: 0 },
    nextConcernId: 1, randomState: randomState || 1,
    emotions: { anger: 0, resentment: 0, stress: 0 }, concerns: [], memories: [],
    intent: { kind: 'cooperate', since: at, until: at, actionId: null, reason: '尚未安排任务' },
    expression: { kind: 'explanation', tone: 'neutral', reason: '观察当前环境', allowDeception: false, revision: 0 },
    effort: 1,
  };
}

function activeConcern(mind: MindState, kind: ConcernKind): MindConcern | undefined {
  return mind.concerns.find(concern => concern.kind === kind && concern.status !== 'resolved');
}

function ensureConcern(mind: MindState, kind: ConcernKind, at: number, severity: number): MindConcern {
  const current = activeConcern(mind, kind);
  if (current) { current.severity = clamp(severity); current.updatedAt = Math.max(current.updatedAt, at); return current; }
  const concern: MindConcern = { id: mind.nextConcernId++, kind, status: 'open', openedAt: at, updatedAt: at, resolvedAt: null, denials: 0, severity: clamp(severity) };
  mind.concerns.push(concern);
  // 未解决诉求最多四种。裁剪只丢掉最旧的已解决轮次，不会重置正在积累的不满。
  while (mind.concerns.length > MAX_CONCERNS) {
    const resolved = mind.concerns.findIndex(item => item.status === 'resolved');
    mind.concerns.splice(resolved < 0 ? 0 : resolved, 1);
  }
  mind.revision++;
  return concern;
}

/**
 * 按事件评价经历。必须由宿主依序传入；重复、倒序和非法事件不产生任何增量。
 * 返回值由宿主一次性应用到自己的权威信任和士气，核心没有第二份玩家信任。
 */
export function receiveEvent(mind: MindState, profile: NpcProfile, event: MindEvent): AppraisalDelta {
  const none = { applied: false, trustDelta: 0, moraleDelta: 0 };
  if (!Number.isSafeInteger(event.sequence) || event.sequence <= mind.lastEventSequence || event.sequence <= 0 || !Number.isFinite(event.at) || event.at < 0 || !EVENT_TYPES.includes(event.type) || typeof event.fact !== 'string') return none;
  const traits = profile.traits;
  const magnitude = event.magnitude === undefined ? 1 : clamp(event.magnitude);
  const at = Math.max(event.at, mind.updatedAt);
  // 旧 v1 缺少阶段标记时保守初始化：记忆可能已被裁剪，不能猜测某次道歉是否领过奖励。
  const reconciliation = mind.reconciliation ??= { grievanceRevision: 0, apologyRevision: 0 };
  const newGrievance = magnitude > 0 && ['request_denied', 'promise_broken', 'deception_exposed', 'urged'].includes(event.type);
  if (newGrievance) reconciliation.grievanceRevision = event.sequence;
  let anger = 0, resentment = 0, stress = 0, trustDelta = 0, moraleDelta = 0;
  switch (event.type) {
    case 'request_denied': {
      const concern = ensureConcern(mind, event.concern ?? 'rest', at, .5);
      concern.denials++;
      concern.status = 'open';
      anger = (.045 + traits.impulsivity * .15 + traits.autonomy * .055) * (1 - traits.patience * .35);
      resentment = .035 + traits.fairness * .035 + traits.selfInterest * .04;
      stress = .04;
      trustDelta = -(.025 + traits.fairness * .025) * magnitude;
      moraleDelta = -.025 * magnitude;
      break;
    }
    case 'request_granted': {
      const concern = activeConcern(mind, event.concern ?? 'rest');
      if (concern) { concern.status = 'granted'; concern.updatedAt = at; }
      // 口头允许只缓和眼前压力，不代表恢复已经发生。信任等待真实兑现，
      // 否则“拒绝→许可→道歉”的循环会在没有任何行动时产生净奖励。
      anger = -.12; stress = -.06;
      break;
    }
    case 'promise_broken':
      ensureConcern(mind, event.concern ?? 'fairness', at, .65);
      anger = .12 + traits.impulsivity * .12;
      resentment = .14 + traits.fairness * .1;
      stress = .06; trustDelta = -.12 * magnitude; moraleDelta = -.08 * magnitude;
      break;
    case 'promise_kept': anger = -.1; resentment = -.1; stress = -.07; trustDelta = .07 * magnitude; moraleDelta = .04 * magnitude; break;
    case 'praised': anger = -.035; stress = -.025; trustDelta = .01 * magnitude; moraleDelta = .03 * magnitude; break;
    case 'urged':
      anger = .025 + traits.impulsivity * .075 + traits.autonomy * .045;
      resentment = .02 + traits.autonomy * .035; stress = .035;
      trustDelta = -.015 * magnitude; moraleDelta = -.025 * magnitude;
      break;
    case 'deception_exposed':
      anger = .09 + traits.impulsivity * .1;
      resentment = traits.selfInterest * .08; stress = .14;
      trustDelta = -.04 * magnitude; moraleDelta = -.045 * magnitude;
      break;
    case 'work_completed': stress = -.02; moraleDelta = .005 * magnitude; break;
    case 'help_received': anger = -.08; resentment = -.055; stress = -.09; trustDelta = .035 * magnitude; moraleDelta = .04 * magnitude; break;
    case 'peer_protest': anger = traits.empathy * .035; stress = .015; break;
    // 一轮真实冲突只接受一次有效道歉。换线程、换说法、暂停或读取存档不能重领奖励；
    // 道歉只缓和怒气，未兑现承诺、怨恨和未满足诉求仍然保留。
    case 'apologized':
      if (magnitude > 0 && reconciliation.apologyRevision < reconciliation.grievanceRevision) {
        reconciliation.apologyRevision = reconciliation.grievanceRevision;
        anger = -.1; stress = -.035; trustDelta = .015 * magnitude;
      }
      break;
  }
  mind.emotions.anger = clamp(mind.emotions.anger + anger * magnitude);
  mind.emotions.resentment = clamp(mind.emotions.resentment + resentment * magnitude);
  mind.emotions.stress = clamp(mind.emotions.stress + stress * magnitude);
  mind.lastEventSequence = event.sequence;
  mind.updatedAt = at;
  // 新的否决/失约值得立即重新评价原合作；已经形成的拒工不能被又一次催促
  // 顺手解除。grant 的实际恢复动作在 decideBehavior 中拥有独立优先级。
  if (['request_denied', 'promise_broken', 'deception_exposed', 'urged'].includes(event.type) && !['refuse', 'recruit', 'strike'].includes(mind.intent.kind)) {
    mind.intent.until = Math.max(mind.intent.since, Math.min(mind.intent.until, at));
  }
  mind.memories.push({ sequence: event.sequence, at, type: event.type,
    ...(event.actorId ? { actorId: event.actorId.slice(0, 100) } : {}),
    ...(event.concern ? { concern: event.concern } : {}),
    fact: event.fact.slice(0, 280), salience: clamp(Math.abs(anger) + Math.abs(resentment) + .1),
  });
  if (mind.memories.length > MAX_MEMORIES) mind.memories.splice(0, mind.memories.length - MAX_MEMORIES);
  mind.revision++;
  return { applied: true, trustDelta, moraleDelta };
}

/**
 * 更新连续状态与诉求生命周期。建立/恢复使用不同阈值，避免临界值抖动创建新请求。
 * 逐帧的微小情绪衰减不提高语义 revision；异步语言仅因真正的立场变化失效。
 */
export function updateMind(mind: MindState, profile: NpcProfile, observation: MindObservation): void {
  const now = Math.max(mind.updatedAt, finiteTime(observation.now));
  const dt = now - mind.updatedAt;
  const traits = profile.traits;
  mind.emotions.anger *= Math.exp(-dt * (.007 + traits.patience * .009));
  mind.emotions.resentment *= Math.exp(-dt * .0015);
  const pressure = Math.max(observation.needs.fatigue, observation.needs.hunger, observation.needs.pain, observation.needs.exposure);
  const stressTarget = clamp(pressure * .65 + observation.unfairness * .15 + mind.emotions.anger * .2);
  mind.emotions.stress = clamp(stressTarget + (mind.emotions.stress - stressTarget) * Math.exp(-dt * .06));
  mind.updatedAt = now;
  const values: Record<ConcernKind, { value: number; open: number; close: number }> = {
    rest: { value: Math.max(observation.needs.fatigue, observation.workload * .88), open: .57 + traits.diligence * .09, close: .36 },
    food: { value: observation.needs.hunger, open: .66, close: .32 },
    fairness: { value: observation.unfairness, open: .7 - traits.fairness * .18, close: .25 },
    safety: { value: Math.max(observation.needs.pain, observation.needs.exposure), open: .68 - (1 - traits.courage) * .15, close: .3 },
  };
  for (const kind of CONCERN_KINDS) {
    const item = values[kind];
    const existing = activeConcern(mind, kind);
    if (existing) {
      existing.severity = clamp(item.value);
      existing.updatedAt = now;
      if (item.value <= item.close) {
        existing.status = 'resolved'; existing.resolvedAt = now;
        mind.emotions.anger = clamp(mind.emotions.anger - .055);
        mind.emotions.stress = clamp(mind.emotions.stress - .04);
        mind.revision++;
      }
    } else if (item.value >= item.open) ensureConcern(mind, kind, now, item.value);
  }
}

function random(mind: MindState): number {
  // 显式保存的 LCG 状态使同一存档、同一输入序列能够重放；不使用 Math.random。
  mind.randomState = (Math.imul(mind.randomState, 1664525) + 1013904223) >>> 0;
  return mind.randomState / 4294967296;
}

function setExpression(mind: MindState, kind: ExpressionKind, tone: ExpressionTone, reason: string, concern?: ConcernKind, allowDeception = false): void {
  const previous = mind.expression;
  if (previous.kind === kind && previous.tone === tone && previous.reason === reason && previous.concern === concern && previous.allowDeception === allowDeception) return;
  mind.expression = { kind, tone, reason, ...(concern ? { concern } : {}), allowDeception, revision: previous.revision + 1 };
  mind.revision++;
}

function finish(mind: MindState, now: number, intent: BehaviorIntent, offer: ActionOffer | undefined, reason: string, effort: number, kind: ExpressionKind, tone: ExpressionTone, concern?: ConcernKind, allowDeception = false): BehaviorDecision {
  const actionId = offer?.id ?? null;
  if (mind.intent.kind !== intent || mind.intent.actionId !== actionId || mind.intent.reason !== reason || now >= mind.intent.until) {
    // 对抗和擅自休息维持至少八秒，合作只维持两秒；真实恢复可提早解除。
    const duration = ['refuse', 'recruit', 'strike'].includes(intent) ? 10 : ['rest', 'evade', 'bargain'].includes(intent) ? 8 : 2;
    mind.intent = { kind: intent, since: now, until: now + duration, actionId, reason };
    mind.revision++;
  }
  mind.effort = clamp(effort);
  setExpression(mind, kind, tone, reason, concern, allowDeception);
  return { actionId, intent, expression: { ...mind.expression }, reason, effort: mind.effort };
}

function currentDecision(mind: MindState): BehaviorDecision {
  return { actionId: mind.intent.actionId, intent: mind.intent.kind, expression: { ...mind.expression }, reason: mind.intent.reason, effort: mind.effort };
}

/**
 * 在已合法的动作中裁决合作与个人目标。只返回选择，宿主仍需验证并执行动作。
 * 优先级：身体急需 → 已获准的需要 → 最短立场承诺 → 共同停工/个人反应 → 工作评分。
 */
export function decideBehavior(mind: MindState, profile: NpcProfile, observation: MindObservation, offers: readonly ActionOffer[]): BehaviorDecision {
  updateMind(mind, profile, observation);
  const now = mind.updatedAt;
  const t = profile.traits;
  const rest = offers.find(offer => offer.kind === 'rest') ?? offers.find(offer => offer.kind === 'idle') ?? offers.find(offer => offer.kind === 'shelter');
  const food = offers.find(offer => offer.kind === 'eat');
  const shelter = offers.find(offer => offer.kind === 'shelter');
  const command = offers.find(offer => offer.id === observation.commandActionId);
  const primary = mind.concerns.filter(concern => concern.status !== 'resolved').sort((a, b) => (b.severity + b.denials * .09) - (a.severity + a.denials * .09))[0];
  const angryTone: ExpressionTone = mind.emotions.anger > .48 || t.impulsivity > .8 && mind.emotions.anger > .24 ? 'angry' : 'irritated';
  if (observation.needs.hunger >= .94 && food) return finish(mind, now, 'rest', food, '饥饿已危及继续行动', 1, 'complaint', 'tired', 'food');
  if (observation.needs.exposure >= .94 && shelter) return finish(mind, now, 'rest', shelter, '环境暴露已危及安全', 1, 'complaint', 'tired', 'safety');
  if ((observation.needs.fatigue >= .93 || observation.needs.pain >= .9) && rest) return finish(mind, now, 'rest', rest, '身体已经无法安全继续工作', 1, 'refusal', angryTone, 'rest');
  const granted = mind.concerns.find(concern => concern.status === 'granted');
  const grantedOffer = granted?.kind === 'food' ? food : granted?.kind === 'safety' ? shelter ?? rest : granted?.kind === 'rest' ? rest : undefined;
  if (granted && grantedOffer) return finish(mind, now, 'rest', grantedOffer, '约定的恢复时间尚未完成', 1, 'explanation', 'tired', granted.kind);
  // 明显的饥饿也会改变正在偷懒/工作的人，而非必须到濒危值才允许吃饭。
  // 餐品是否真的可用仍由 offer 与宿主执行器保障。
  if (observation.needs.hunger >= .76 && food) return finish(mind, now, 'rest', food, '需要先解决持续饥饿', 1, 'request', 'tired', 'food');

  const currentOffer = offers.find(offer => offer.id === mind.intent.actionId);
  const currentConcern = mind.expression.concern ? activeConcern(mind, mind.expression.concern) : undefined;
  const recoveryEndsRest = mind.intent.kind === 'rest' && mind.expression.concern !== undefined && !currentConcern;
  if (currentOffer && now < mind.intent.until && !recoveryEndsRest) return currentDecision(mind);
  if (offers.length === 0) return finish(mind, now, 'cooperate', undefined, '当前没有可执行的合法行动', 0, 'explanation', 'neutral');

  const denialCount = primary?.denials ?? 0;
  const dissatisfaction = clamp(mind.emotions.resentment * .5 + mind.emotions.anger * .25 + observation.unfairness * t.fairness * .3 + Math.max(0, observation.needs.fatigue - .4) * .3 + denialCount * .055);
  const defiance = t.autonomy * .27 + t.impulsivity * .2 + t.selfInterest * .2 + t.courage * .12 + dissatisfaction * .6 - t.patience * .24 - t.diligence * .15 - observation.trustInAuthority * .12;
  // 二十五秒之外的传闻不继续当作正在发生的集体停工；每人仍需自己的参与动机。
  const visibleProtest = observation.peers.some(peer => peer.id !== profile.id && peer.protesting && peer.observedAt <= now && now - peer.observedAt <= 25 && peer.affinity >= .35 && peer.anger + peer.resentment >= .55);
  if (rest && visibleProtest && dissatisfaction >= .3 && defiance > .48) return finish(mind, now, 'strike', rest, '共同的不满使我决定一起停工', 0, 'refusal', angryTone, primary?.kind ?? 'fairness');
  const potentialAlly = observation.peers.some(peer => peer.id !== profile.id && peer.observedAt <= now && now - peer.observedAt <= 25 && peer.affinity >= .3 && peer.anger + peer.resentment > .48);
  if (rest && potentialAlly && denialCount >= 2 && dissatisfaction > .43 && defiance > .58 && t.courage > .5) return finish(mind, now, 'recruit', rest, '连续受到忽视，我要争取同伴一起拒绝安排', 0, 'recruit', angryTone, primary?.kind ?? 'fairness');

  if (primary && denialCount > 0) {
    if (rest && defiance > .52 && (denialCount >= 2 || t.impulsivity > .8)) return finish(mind, now, 'refuse', rest, '诉求被拒绝后，我决定先停下工作', 0, 'refusal', angryTone, primary.kind);
    if (command && t.patience + t.diligence > 1.4 && mind.emotions.resentment < .8) return finish(mind, now, 'endure', command, '虽然不满，仍愿意把眼前的职责做完', .85, 'complaint', mind.emotions.anger > .25 ? 'irritated' : 'tired', primary.kind);
    if (rest && defiance > .28) return finish(mind, now, 'bargain', rest, '需要明确的调整或补偿才愿意继续', .2, 'bargain', 'irritated', primary.kind);
  }

  // 低勤奋、自利的角色即使体力充足也可能回避高付出；低诚实决定如何掩饰，
  // 不决定世界事实。老练的人会保留表面上的工作动作，用低投入实际磨洋工。
  // 只评价正在考虑的任务：合法命令优先，其次是基础策略明确偏好的候选。
  // 不能因列表里另有低收益劳动，就把高收益照顾/探索也判成回避那份无关劳动。
  const preferred = command ?? offers.reduce<ActionOffer | undefined>((best, offer) =>
    (offer.baseline ?? 0) > (best?.baseline ?? 0) ? offer : best, undefined);
  const demanding = preferred && ['work', 'aid', 'explore'].includes(preferred.kind) ? preferred : undefined;
  const evasionTemptation = demanding ? (1 - t.diligence) * .6 + t.selfInterest * .35 + observation.needs.fatigue * .2 - demanding.selfBenefit * .5 - observation.trustInAuthority * .12 - t.empathy * .1 : 0;
  if (demanding && t.diligence < .38 && t.selfInterest > .62 && evasionTemptation > .52) {
    const conceal = t.honesty < .4;
    const evasion = conceal ? demanding : rest ?? demanding;
    return finish(mind, now, 'evade', evasion, '更在意保留自己的精力，倾向少承担工作', conceal ? .28 : .15, conceal ? 'conceal' : 'complaint', conceal ? 'guarded' : 'irritated', primary?.kind, conceal);
  }

  if (primary?.kind === 'rest' && rest && observation.needs.fatigue >= .73 && (denialCount === 0 || !command)) return finish(mind, now, 'rest', rest, '疲劳持续积累，需要实际休息恢复', 1, denialCount ? 'complaint' : 'request', 'tired', 'rest');
  if (primary?.kind === 'food' && food) return finish(mind, now, 'rest', food, '需要先解决持续饥饿', 1, denialCount ? 'complaint' : 'request', 'tired', 'food');

  // 通用效用分只看动作语义与强度。微小的可重放扰动打破同分，不掩盖明确偏好。
  const scored = offers.map(offer => {
    const needBenefit = offer.kind === 'rest' ? observation.needs.fatigue * 1.4 : offer.kind === 'eat' ? observation.needs.hunger * 1.6 : offer.kind === 'shelter' ? observation.needs.exposure * 1.5 : 0;
    const contribution = offer.kind === 'work' || offer.kind === 'aid' ? t.diligence * .6 + t.empathy * offer.groupBenefit * .6 : 0;
    const commandBonus = offer.id === command?.id ? .35 + observation.trustInAuthority * .55 - t.autonomy * .2 : 0;
    // 没有更高优先级的身体/合作冲突时，宿主策略的明确偏好应有实际主导权。
    // 否则普通勤奋加命令奖励就会无端覆盖一个已经合法的模型决定。
    const score = (offer.baseline ?? 0) * 2.2 + needBenefit + contribution + commandBonus + offer.selfBenefit * t.selfInterest * .5 - offer.effort * ((1 - t.diligence) * .45 + observation.needs.fatigue * .5) - offer.risk * (1 - t.courage) + random(mind) * .012;
    return { offer, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0].offer;
  const isRest = best.kind === 'rest' && observation.needs.fatigue >= .45;
  const intent: BehaviorIntent = isRest ? 'rest' : 'cooperate';
  const reason = isRest ? '先恢复精力再承担任务' : '目前愿意配合安排并承担任务';
  return finish(mind, now, intent, best, reason, .65 + t.diligence * .35, primary ? 'request' : 'explanation', primary ? 'tired' : 'neutral', primary?.kind);
}
