import { createMind, decideBehavior, receiveEvent, updateMind,
  type ActionOffer, type BehaviorDecision, type ConcernKind, type MindEventType, type MindObservation } from '../../../../packages/npc-core/src';
import type { ActionId, GameState, Npc, PolicyResult } from '../simulation/types';
import { ACTIONS } from '../simulation/types';
import { clamp, distance } from '../simulation/constants';
import { getWeatherSnapshot } from '../simulation/weather';
import { CAMP_PROFILES } from './profiles';
import { campExpression } from './phrases';

/** 兼容尚未经过存档迁移的测试/宿主对象；初始心智不编造过去的事件。 */
export function ensureCampMind(npc: Npc, now = 0) {
  return npc.mind ??= createMind(CAMP_PROFILES[npc.id], now, npc.id.split('').reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 17) >>> 0);
}

/** 世界信息只在这里转成通用量纲；附近目击或正在共同讨论才构成“知道”。 */
export function observeCampMind(state: GameState, npc: Npc): MindObservation {
  const weather = getWeatherSnapshot(state, npc);
  const person = state.social.people[npc.id];
  const others = state.npcs.filter(other => other.alive && other.id !== npc.id);
  const lowWork = Math.min(person.workload, ...others.map(other => state.social.people[other.id].workload));
  return {
    now: state.elapsed,
    needs: { fatigue: clamp(1 - npc.energy / 100, 0, 1), hunger: clamp(npc.hunger / 100, 0, 1),
      pain: clamp(1 - npc.health / 100, 0, 1), exposure: clamp(weather.exposure * (weather.rainIntensity * .5 + weather.stormRisk * .5), 0, 1) },
    workload: clamp(person.workload / 40, 0, 1), unfairness: clamp((person.workload - lowWork) / 40, 0, 1), trustInAuthority: clamp(npc.trust / 100, 0, 1),
    ...(npc.command ? { commandActionId: npc.command } : {}),
    peers: others.filter(other => distance(npc.position, other.position) <= 18 || state.social.threads.some(thread => thread.participants.includes(npc.id)
      && thread.participants.includes(other.id) && state.elapsed - (thread.lines.at(-1)?.at ?? thread.createdAt) <= 12)).map(other => ({
      id: other.id, affinity: (state.social.relationships.find(pair => pair.from === npc.id && pair.to === other.id)?.affinity ?? 50) / 100,
      anger: other.mind?.emotions.anger ?? 0, resentment: other.mind?.emotions.resentment ?? 0,
      protesting: !!other.mind && ['recruit', 'strike', 'refuse'].includes(other.mind.intent.kind), observedAt: state.elapsed,
    })),
  };
}

/** 心智是怨恨的唯一权威来源；旧 social.resentment 仅保留为 UI/旧接口的投影。 */
export function refreshCampMind(state: GameState, npc: Npc) {
  const mind = ensureCampMind(npc, state.elapsed);
  updateMind(mind, CAMP_PROFILES[npc.id], observeCampMind(state, npc));
  state.social.people[npc.id].resentment = mind.emotions.resentment * 100;
  return mind;
}

/**
 * 按钮、文本、兑现与失约共用这个入口。social.nextId 单调递增，核心自身游标
 * 防止重复事件；信任/士气增量只在此应用一次，不能再叠加旧事件奖励。
 */
export function recordMindEvent(state: GameState, npc: Npc, type: MindEventType, fact: string, concern?: ConcernKind, actorId = 'player') {
  const mind = refreshCampMind(state, npc);
  const delta = receiveEvent(mind, CAMP_PROFILES[npc.id], { sequence: state.social.nextId++, at: state.elapsed, type, fact,
    actorId, ...(concern ? { concern } : {}) });
  if (delta.applied) {
    // 同伴帮助改善与同伴的关系，不能把他人的功劳算成对玩家的信任。
    if (actorId === 'player') npc.trust = clamp(npc.trust + delta.trustDelta * 100);
    npc.morale = clamp(npc.morale + delta.moraleDelta * 100);
    state.social.people[npc.id].resentment = mind.emotions.resentment * 100;
    state.social.revision++;
  }
  return delta;
}

const OFFER: Record<ActionId, Omit<ActionOffer, 'id' | 'baseline'>> = {
  wood: { kind: 'work', effort: .85, risk: .18, selfBenefit: .08, groupBenefit: .8 },
  food: { kind: 'work', effort: .65, risk: .14, selfBenefit: .3, groupBenefit: .82 },
  fire: { kind: 'work', effort: .3, risk: .04, selfBenefit: .25, groupBenefit: .9 },
  eat: { kind: 'eat', effort: 0, risk: 0, selfBenefit: .9, groupBenefit: .08 },
  rest: { kind: 'rest', effort: 0, risk: 0, selfBenefit: .6, groupBenefit: .04 },
  help: { kind: 'aid', effort: .45, risk: .05, selfBenefit: .08, groupBenefit: .95 },
  camp: { kind: 'shelter', effort: .12, risk: 0, selfBenefit: .3, groupBenefit: .25 },
  explore: { kind: 'explore', effort: .95, risk: .75, selfBenefit: .4, groupBenefit: .6 },
};

/**
 * “对我有好处”必须来自可核实的营地状态，不能给工作永远不变的低收益。
 * 例如林枫平时嫌累，但没饭可吃、火快灭且无柴时，他自己也会受损；这时工作
 * 的个人收益会上升。这里只计算动机，不预支任何食物、木材、治疗或完成奖励。
 */
function campActionOffers(state: GameState, npc: Npc, baseline: PolicyResult, allowed: readonly ActionId[]): ActionOffer[] {
  const living = Math.max(1, state.npcs.filter(other => other.alive).length);
  const foodShortage = clamp(1 - state.food / living, 0, 1);
  const woodShortage = clamp(1 - state.wood / 6, 0, 1);
  const heatNeed = clamp((75 - state.fire) / 75, 0, 1);
  const hunger = clamp(npc.hunger / 100, 0, 1);
  const exposure = getWeatherSnapshot(state, npc).exposure;
  const targetId = state.social.agreements.find(agreement => agreement.npcId === npc.id && agreement.action === 'help')?.targetId;
  const patient = state.npcs.filter(other => other.alive && other.id !== npc.id && (other.injured || other.health < 65)
    && (!targetId || other.id === targetId)).sort((a, b) => (a.health - Number(a.injured) * 25) - (b.health - Number(b.injured) * 25))[0];
  const injuryNeed = patient ? clamp(1 - patient.health / 100 + Number(patient.injured) * .2, 0, 1) : 0;
  const affinity = patient ? (state.social.relationships.find(relation => relation.from === npc.id && relation.to === patient.id)?.affinity ?? 50) / 100 : 0;
  const personalBenefit: Partial<Record<ActionId, number>> = {
    wood: .08 + woodShortage * .55 * (.35 + heatNeed * .65),
    food: .12 + foodShortage * .55 * (.6 + hunger * .4) + hunger * .18,
    fire: .1 + heatNeed * .8 + exposure * npc.wetness / 100 * .1,
    // 同伴已经重伤会危及整个队伍；亲近的人使互助也具有具体的个人价值。
    help: .06 + injuryNeed * (.55 + affinity * .35),
    explore: .12 + Math.max(foodShortage * (.7 + hunger * .3), woodShortage * heatNeed) * .65,
  };
  return allowed.map(id => ({ id, ...OFFER[id], selfBenefit: clamp(personalBenefit[id] ?? OFFER[id].selfBenefit, 0, 1),
    baseline: id === baseline.action ? 1 : 0 }));
}

/**
 * MLP 仍只认识原来的八个动作。它提供候选偏好，通用心智裁定是否愿意执行；
 * 最终执行权和身体安全仍留在营地，不把一句气话变成删物资或瞬移。
 */
export function decideCampBehavior(state: GameState, npc: Npc, baseline: PolicyResult, allowed: readonly ActionId[]): { result: PolicyResult; decision: BehaviorDecision } {
  const mind = refreshCampMind(state, npc);
  const observation = observeCampMind(state, npc);
  // 明确的新委托可让仍愿合作的人换任务；拒工、自主休息和磨洋工的维持期不能被命令清零。
  if (npc.command && npc.command !== mind.intent.actionId && ['cooperate', 'endure'].includes(mind.intent.kind)) mind.intent.until = state.elapsed;
  const offers = campActionOffers(state, npc, baseline, allowed);
  const decision = decideBehavior(mind, CAMP_PROFILES[npc.id], observation, offers);
  let selected = decision.actionId && ACTIONS.includes(decision.actionId as ActionId) && allowed.includes(decision.actionId as ActionId)
    ? decision.actionId as ActionId : baseline.action;
  let safetyReason = '';
  if (npc.inventory.wood || npc.inventory.food) {
    selected = allowed.includes('camp') ? 'camp' : 'rest'; safetyReason = '先完成手中物资的返送，再处理休息和分工争议。';
  } else if (npc.hunger >= 88 && allowed.includes('eat')) {
    selected = 'eat'; safetyReason = '饥饿已危急，先进食。';
  } else if ((npc.energy < 8 || npc.health < 30) && allowed.includes('rest')) {
    selected = 'rest'; safetyReason = '身体已濒危，先停止消耗并恢复。';
  } else if (state.elapsed >= state.duration - 30 && (npc.command === 'camp' || baseline.action === 'camp') && allowed.includes('camp')) {
    // 临近离营的安全集合只是改变地点，不能据此清除拒工、怨恨或声称他同意继续劳动。
    selected = 'camp'; safetyReason = '临近天亮，先回安全集合区；停工立场与分工争议保持不变。';
  }
  npc.actionEffort = safetyReason || !['wood', 'food', 'fire', 'help', 'explore'].includes(selected) ? 1 : clamp(decision.effort, .1, 1);
  const emotional = mind.emotions.anger >= .3 || mind.emotions.resentment >= .45;
  const emotion = emotional ? 'annoyed' : mind.emotions.stress >= .5 ? 'worried' : baseline.emotion;
  const overridden = selected !== baseline.action || !['cooperate', 'endure'].includes(decision.intent) || !!safetyReason;
  return { decision, result: { ...baseline, action: selected, emotion, ...(overridden ? { source: 'rules' as const,
    reason: `${safetyReason || decision.reason}；实际选择「${selected}」，投入 ${Math.round(npc.actionEffort * 100)}%。` } : {}) } };
}

/** 发出新的工作安排时，只在确有未解决休息诉求时计作一次拒绝；每帧推理不再计数。 */
export function noticeCampOrder(state: GameState, npc: Npc, action: ActionId | null) {
  const mind = refreshCampMind(state, npc);
  if (action === 'rest' && mind.concerns.some(concern => concern.kind === 'rest' && concern.status === 'open')) {
    recordMindEvent(state, npc, 'request_granted', '玩家明确允许先休息；是否兑现仍看实际恢复。', 'rest');
  }
  else if (action && ['wood', 'food', 'fire', 'help', 'explore'].includes(action)
    && mind.concerns.some(concern => concern.kind === 'rest' && concern.status === 'open')) recordMindEvent(state, npc, 'request_denied', '提出休息后，玩家仍安排继续工作。', 'rest');
}

/** 事件后尽快重新评估，但携带中的送货是已发生的物理事实，必须先完成。 */
export function requestMindReview(state: GameState, npc: Npc) {
  if (npc.inventory.wood || npc.inventory.food) return;
  npc.previousAction = npc.action ?? npc.previousAction ?? null;
  npc.decisionTrigger = 'social'; npc.decisionIn = 0;
  delete npc.manualTarget;
  if (npc.action) state.stats.taskSwitches++;
  npc.action = null; npc.progress = 0; npc.actionDuration = 0; npc.destination = { ...npc.position };
}

/**
 * 拖动仅是一项移动请求。不能用它绕过已经形成的停工/休息承诺，或中断背包返送。
 * 正常愿意合作的人仍保留原来的自由行走/碰撞体验。
 */
export function canAcceptManualMove(state: GameState, npc: Npc): boolean {
  const mind = refreshCampMind(state, npc);
  if (npc.inventory.wood || npc.inventory.food || npc.energy < 8 || npc.health < 30) return false;
  if (['refuse', 'recruit', 'strike', 'rest'].includes(mind.intent.kind) && mind.intent.until > state.elapsed) return false;
  return !mind.concerns.some(concern => concern.status !== 'resolved' && concern.kind === 'rest' && concern.denials >= 2);
}

export function publishCampExpression(state: GameState, npc: Npc, fallback?: string) {
  if ((npc.collision?.reactionUntil ?? 0) > state.elapsed) return;
  npc.speech = campExpression(npc, fallback); npc.speechUntil = state.elapsed + 6;
  if ((npc.mind?.emotions.anger ?? 0) > .3) npc.emotion = 'annoyed';
}
