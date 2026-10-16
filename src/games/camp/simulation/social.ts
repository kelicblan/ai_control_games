import { NPC_IDS, type Npc, type GameState, type NpcId, type ActionId, type GameCommand } from './types';
import { ACTION_LABELS, clamp, MAX_EVENTS, MEAL_RELIEF } from './constants';
import { getAllowedActions } from './observation';
import { PERSONAS } from './personalities';
import type { SocialState, SocialThread, SocialChoice, SocialKind, SocialTopic, SocialMemory, SocialPromise, SocialAgreement } from './social-types';
import type { ConcernKind } from '../../../../packages/npc-core/src';
import { decideCampBehavior, noticeCampOrder, publishCampExpression, recordMindEvent, refreshCampMind, requestMindReview } from '../npc/bridge';
import { campExpression } from '../npc/phrases';
import { parsePlayerIntent, type PlayerIntent } from '../npc/player-intents';
import { getCampProfile, hasCustomCampTraits } from '../npc/profiles';
import { personalityCheckin, personalityAcknowledgement } from '../npc/personality-expression';
import { truthfulVillageSpeech } from '../npc/world-context';
import { remember, rememberSpeech } from '../npc/experience';
import { collectiveActionCompleted } from '../npc/collectives';

export const SOCIAL_LIMITS = { threads: 12, lines: 16, memories: 60, promises: 16, agreements: NPC_IDS.length, text: 400 } as const;
export function createSocialState(npcs: readonly Npc[], elapsed = 0): SocialState {
  return {
    version: 1, revision: 0, nextId: 1, nextLineId: 1,
    nextCheckAt: elapsed + 8, nextPromptAt: elapsed + 8, introduced: elapsed > 0,
    people: Object.fromEntries(NPC_IDS.map(id => [id, { workload: 0, resentment: 0, cooldownUntil: elapsed }])) as SocialState['people'],
    threads: [], memories: [], promises: [], agreements: [],
    relationships: npcs.flatMap(from => npcs.filter(to => to.id !== from.id).map(to => ({ from: from.id, to: to.id, affinity: 60 }))),
    stats: { initiated: 0, replied: 0, resolved: 0, ignored: 0, kept: 0, broken: 0 },
  };
}

const WORK = new Set<ActionId>(['wood', 'food', 'fire', 'help', 'explore']);
const REQUEST_LIFETIME = 32;
const PROMISE_LIFETIME = 45;
const member = (state: GameState, id: NpcId) => state.npcs.find(npc => npc.id === id)!;
const latestPromise = (state: GameState, id: NpcId) => state.social.promises.filter(promise => promise.npcId === id
  && (promise.status === 'pending' || promise.status === 'broken')).at(-1);
const promiseLabel = (kind: SocialPromise['kind']) => kind === 'meal' ? '吃到一份食物' : '完成一次休息';

function event(state: GameState, text: string, npcId: NpcId, kind: 'info' | 'good' | 'warning' = 'info') {
  state.events.push({ id: state.nextEventId++, time: state.elapsed, kind, text: text.slice(0, 400), npcId });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function memory(state: GameState, npcId: NpcId, threadId: number, kind: SocialMemory['kind'], text: string, otherId?: NpcId) {
  state.social.memories.push({ id: state.social.nextId++, npcId, threadId, at: state.elapsed, kind,
    text: text.slice(0, SOCIAL_LIMITS.text), ...(otherId && otherId !== npcId ? { otherId } : {}) });
  if (state.social.memories.length > SOCIAL_LIMITS.memories) state.social.memories.splice(0, state.social.memories.length - SOCIAL_LIMITS.memories);
}

function say(state: GameState, thread: SocialThread, speaker: NpcId | 'player', text: string) {
  const bounded = (speaker === 'player' ? text : truthfulVillageSpeech(state, member(state, speaker), text)).slice(0, SOCIAL_LIMITS.text);
  rememberSpeech(state, speaker, bounded, thread.participants);
  thread.lines.push({ id: state.social.nextLineId++, speaker, text: bounded, at: state.elapsed,
    source: speaker === 'player' ? 'player' : 'template' });
  if (thread.lines.length > SOCIAL_LIMITS.lines) thread.lines.splice(0, thread.lines.length - SOCIAL_LIMITS.lines);
  thread.revision++;
  if (speaker !== 'player') {
    const npc = member(state, speaker);
    if ((npc.collision?.reactionUntil ?? 0) <= state.elapsed) {
      npc.speech = bounded;
      npc.speechUntil = state.elapsed + 6;
    }
  }
}

function changeTrust(_state: GameState, npc: Npc, amount: number) {
  const traits = getCampProfile(npc).traits;
  npc.trust = clamp(npc.trust + amount * (amount < 0 ? .8 + traits.fairness * .5 : 1));
  npc.morale = clamp(npc.morale + amount * .5);
  // 日常小额好感不能直接清空长期怨恨，怨恨只由通用心智的经历与衰减负责。
  npc.emotion = amount < 0 || (npc.mind?.emotions.anger ?? 0) > .3 ? 'annoyed' : 'happy';
}

function relationship(state: GameState, from: NpcId, to: NpcId, amount: number) {
  const relation = state.social.relationships.find(item => item.from === from && item.to === to);
  if (relation) relation.affinity = clamp(relation.affinity + amount);
}

function mostBurdened(state: GameState, thread?: SocialThread): Npc {
  const candidates = state.npcs.filter(npc => npc.alive && (!thread || thread.participants.includes(npc.id)));
  return candidates.sort((a, b) => state.social.people[b.id].workload - state.social.people[a.id].workload
    || a.energy - b.energy)[0] ?? state.npcs[0];
}

function helper(state: GameState, except: NpcId, action?: ActionId, targetId?: NpcId): Npc | undefined {
  return state.npcs.filter(npc => npc.alive && npc.id !== except && npc.id !== targetId && !npc.injured && npc.health >= 45 && npc.energy >= 35
    && npc.hunger < 80 && !npc.manualTarget && !npc.inventory.wood && !npc.inventory.food
    && !state.social.agreements.some(agreement => agreement.npcId === npc.id)
    && (!action || !actionProblem(state, npc, action)))
    .sort((a, b) => (b.energy - state.social.people[b.id].workload + b.personality.diligence * 40)
      - (a.energy - state.social.people[a.id].workload + a.personality.diligence * 40))[0];
}

function replacementFor(state: GameState, tired: Npc, action: ActionId): Npc | undefined {
  // Evaluate the seat that the tired worker is about to vacate. Otherwise the
  // task cap rejects idle candidates and mistakenly selects another busy worker.
  const afterHandoff = { ...state, npcs: state.npcs.map(npc => npc.id === tired.id ? { ...npc, action: null }
    : npc.action === action ? { ...npc, manualTarget: { ...npc.position } } : npc) };
  return helper(afterHandoff, tired.id, action);
}

function injuredPartner(state: GameState, npc: Npc): Npc | undefined {
  return state.npcs.filter(other => other.alive && other.id !== npc.id && (other.injured || other.health < 65))
    .sort((a, b) => a.health - b.health)[0];
}

/** A player's agreement is bounded by the same legal jobs and physical safety as ordinary decisions. */
function actionProblem(state: GameState, npc: Npc, action: ActionId): string | undefined {
  if (!npc.alive) return '伙伴已经无法行动';
  if (action !== 'eat' && npc.hunger >= 88 && getAllowedActions(state, npc).includes('eat')) return '饥饿已经危急，先吃到食物';
  if (WORK.has(action) && (npc.health < 35 || npc.energy < 18 || npc.hunger >= 85)) return '先处理伤势、饥饿或体力';
  if (action === 'explore' && (state.weather === 'storm' || npc.fear >= 65)) return '天气或状态不适合探路';
  // Delivery must finish first. Rest/camp can still route the carried supplies home.
  if ((npc.inventory.wood || npc.inventory.food) && action !== 'rest' && action !== 'camp') return '先把手中的补给送回仓库';
  if (!getAllowedActions(state, npc).includes(action)) return action === 'fire' ? '木材不足、火势充足或已有守火人'
    : action === 'food' || action === 'wood' ? '已有足够人手，或库存已满'
      : action === 'help' ? '已有帮手，或暂时无人需要治疗' : '当前条件不适合这项安排';
  return undefined;
}

function promiseProblem(state: GameState, npcId: NpcId, kind: SocialPromise['kind']): string | undefined {
  if (state.social.promises.some(item => item.npcId === npcId && item.kind === kind && item.status === 'pending')) return '先兑现已经答应的事';
  return undefined;
}

function choose(id: string, label: string, description: string, disabledReason?: string): SocialChoice {
  return { id, label, description, ...(disabledReason ? { disabledReason } : {}) };
}

export function getSocialChoices(state: GameState, thread: SocialThread): SocialChoice[] {
  if (thread.status !== 'open' || !['playing', 'paused'].includes(state.status)) return [];
  const npc = member(state, thread.initiator);
  if (!npc?.alive) return [];
  const feedProblem = state.food < 1 ? '库存里还没有食物' : npc.hunger < 10 ? '伙伴暂时不饿' : undefined;
  const burdened = mostBurdened(state, thread);
  const resting = thread.kind === 'rest' ? npc : burdened;
  const replacement = replacementFor(state, resting, resting.action && WORK.has(resting.action) ? resting.action : 'wood');
  switch (thread.kind) {
    case 'work': return [
      choose('wood', '先备柴，分开干活', '提高木材优先级，安排一位体力合适的伙伴采木。', helper(state, npc.id, 'wood') || !actionProblem(state, npc, 'wood') ? undefined : '暂时没有适合采木的人手'),
      choose('food', '先找食物，别饿着', '提高食物优先级，安排一位体力合适的伙伴采集。', helper(state, npc.id, 'food') || !actionProblem(state, npc, 'food') ? undefined : '暂时没有适合采集的人手'),
      choose('balanced', '按需要分工', '恢复均衡安排，让一位合适的伙伴处理最缺的补给。'),
      ...(npc.mind?.expression.allowDeception ? [choose('verify', '核查你的说辞和进度', '查看实际行动、投入和背包；不会凭角色说法增加物资。')] : []),
    ];
    case 'rest': return [
      choose('rest', '现在就回屋休息', '先把手中物资送到仓库，再回自己的民居恢复体力。', actionProblem(state, npc, 'rest')),
      choose('swap', '找人接班，你歇会儿', '安排另一位体力合适的伙伴接手一轮工作。', actionProblem(state, npc, 'rest') ?? (replacement ? undefined : '暂时没有适合接班的伙伴')),
      choose('promise', '忙完这轮，保证让你休息', '记下一项承诺：45 秒内真正完成一次休息，才算兑现。', promiseProblem(state, npc.id, 'rest')),
      choose('deny', '现在不准休息，继续干', '明确拒绝本轮休息诉求。伙伴可能忍耐、谈条件、擅自休息或拒工。'),
    ];
    case 'food': return [
      choose('feed', '把这份食物给你', '消耗 1 份库存，立刻缓解饥饿。', feedProblem),
      choose('gather', '一起补充食物', '请一位安全、体力合适的伙伴完成一趟采集。', helper(state, npc.id, 'food') || !actionProblem(state, npc, 'food') ? undefined : '暂时没有适合采集的人手'),
      choose('promise', '答应尽快让你吃上', '45 秒内实际分食或自主进食；空口答应不会增加好感。', promiseProblem(state, npc.id, 'meal')),
    ];
    case 'weather': return [
      choose('shelter', '先回民居避一避', '回自己的屋里避雨休息，降低暴露并恢复体力。', actionProblem(state, npc, 'rest')),
      choose('continue', '保留安排，身体撑不住就回', '保持当前任务，不额外增加工作；紧急需求仍可中断。'),
    ];
    case 'fairness': return [
      choose('rotate', `让${burdened.name}歇会儿，换班`, '把一轮工作交给较轻松的伙伴，减少分工不满。', actionProblem(state, burdened, 'rest') ?? (replacement ? undefined : '暂时没有安全的接班人')),
      choose('promise', `承诺补给${burdened.name}一次休息`, '记录具体休息承诺；兑现以后再恢复信任。', promiseProblem(state, burdened.id, 'rest')),
      choose('maintain', '眼下先维持分工', '继续原有任务；承担较多的人可能仍会不满。'),
    ];
    case 'help': { const target = injuredPartner(state, npc); return [
      choose('help', '你去照顾，我来协调', '帮助受伤的同伴，实际完成后双方记下这次互助。', actionProblem(state, npc, 'help')),
      choose('delegate', '换位伙伴去帮忙', '让体力更合适的人照顾伤员，你先休息。', target && helper(state, npc.id, 'help', target.id) ? undefined : '暂时没有需要照顾的对象或适合接手的帮手'),
      choose('rest', '先照顾好你自己', '让你先休息；伤员仍需要另外安排。', actionProblem(state, npc, 'rest')),
    ]; }
    case 'explore': return [
      choose('explore', '探一趟路，带上收获就回来', '只约定一趟寨外探索；180 秒内未完成会召回，危险时取消。', actionProblem(state, npc, 'explore')),
      choose('camp', '先在村寨帮着照应', '安排回寨，到广场集合，把探索建议留待之后再谈。', actionProblem(state, npc, 'camp')),
      choose('rest', '先歇一会儿，换换心情', '安排一次休息，不用不停重复同一项劳动。', actionProblem(state, npc, 'rest')),
    ];
    case 'promise': {
      const promise = latestPromise(state, npc.id);
      const problem = !promise ? '目前没有待处理的承诺' : promise.kind === 'meal' ? feedProblem : actionProblem(state, npc, 'rest');
      return [choose('fulfil', promise?.kind === 'meal' ? '现在给你一份食物' : '现在安排你休息', '按实际行动记录；已经失约的历史仍然保留。', problem),
        choose('renew', '重新约定一个明确期限', '重新开始一项 45 秒承诺，不抹掉之前的失约。', !promise ? '目前没有待处理的承诺' : promise.status === 'pending' ? '先处理现有期限，不无限延期' : promiseProblem(state, npc.id, promise.kind)),
        choose('explain', '把现在的困难讲清楚', '承认当前状态，不凭一句解释消除失约；之后仍可用行动补救。')];
    }
    case 'checkin': return [choose('listen', '我在听，说说你的想法', '认可伙伴的需要，少量改善信任；不擅自改变任务。'),
      choose('rest', '安排你回屋休息', '先把手中的物资送到仓库，再回自己的民居歇脚。', actionProblem(state, npc, 'rest')),
      choose('plan', '我们一起商量分工', '继续讨论该优先补充什么，再落实到具体任务。'),
      choose('verify', '核查你的说辞和进度', '对照正在做的事、实际投入与背包，识别掩饰；口头报告不算完成。')];
  }
}

function kindForTopic(state: GameState, npc: Npc, topic: SocialTopic): SocialKind {
  if (topic === 'conflict') return 'fairness';
  if (topic !== 'checkin') return topic;
  if (npc.energy < 48 || state.social.people[npc.id].workload > 30) return 'rest';
  if (npc.hunger > 62) return 'food';
  const traits = getCampProfile(npc).traits;
  if (traits.courage < .35 && (npc.fear > 38 || npc.wetness > 25 || state.weather !== 'clear')) return 'weather';
  if (traits.empathy >= .65 && injuredPartner(state, npc)) return 'help';
  if (PERSONAS[npc.id].traits.curiosity > .8 && !hasCustomCampTraits(npc)) return 'explore';
  return 'checkin';
}

function promptFor(state: GameState, npc: Npc, kind: SocialKind): { title: string; prompt: string; participants: NpcId[] } {
  const participants: NpcId[] = [npc.id];
  const identity = hasCustomCampTraits(npc) ? undefined : npc.id;
  let title = '听听彼此的想法';
  let prompt = ({ azhuang: '有事尽管叫我。也想听听你怎么安排大家。', xiaomi: '你愿意听我说说吗？安排清楚一些，我会安心。',
    laozhou: '先说清楚，哪份活归谁。我这把年纪，别什么都指望我。', linlan: '别一会儿又给我塞活。有什么事现在说。', aye: '我有些新想法，你愿意和我商量吗？',
    tiesheng: '', aling: '', xiaoman: '', shenyan: '' })[npc.id];
  prompt = personalityCheckin(npc, prompt);
  switch (kind) {
    case 'work': title = '今晚怎么分工？'; prompt = identity === 'linlan' ? '先说好，我不包那些累活。为什么又让我干？'
      : identity === 'laozhou' ? '分工得讲究，我在近处照应就行，重活让年轻人试试。' : '大家都在，先备柴还是找吃的？你来定个方向吧。'; break;
    case 'rest': title = '需要歇脚与换班'; prompt = identity === 'azhuang' ? '我还能撑，但想先和你约好，谁来接我这轮？'
      : identity === 'laozhou' ? '我这边也累着呢，重活换个人接吧。' : identity === 'linlan' ? '干够了，我要歇会儿。别什么活都往我这儿塞。' : '这轮工作有些累了，我想和你商量一下休息。'; break;
    case 'food': title = '这一份食物怎么安排？'; prompt = npc.hunger > 55 ? '肚子有些饿了。能分一份，还是先安排人找吃的？' : '想和你商量食物分配，也给后面留些余量。'; break;
    case 'weather': title = '对安全有些担心'; prompt = state.weather === 'clear' ? '现在天气还好，想先和你讲清楚遇险时怎么安排。' : '这天气让我不太踏实，能安排在近处或先躲躲吗？'; break;
    case 'fairness': {
      title = '有人承担得更多';
      const burdened = mostBurdened(state);
      const least = state.npcs.filter(other => other.alive && other.id !== burdened.id)
        .sort((a, b) => state.social.people[a.id].workload - state.social.people[b.id].workload)[0];
      participants.push(burdened.id);
      if (least) participants.push(least.id);
      prompt = state.social.people[burdened.id].workload > 10 ? `${burdened.name}已经干了不少。下一轮能不能换个人承担？` : '想把分工说清楚，大家也都需要休息，你怎么看？';
      break;
    }
    case 'help': {
      title = '照顾别人，也别忘了自己';
      const target = injuredPartner(state, npc);
      if (target) participants.push(target.id);
      prompt = target ? `${target.name}身体不太好，我想去照顾。原来的工作怎么安排？` : '暂时没有人需要治疗，我们先商量好谁来照顾伙伴。'; break;
    }
    case 'explore': title = '想试试新的路'; prompt = '我想出去探一趟补给，找到就回来。能给我这个机会吗？'; break;
    case 'promise': {
      title = '我们说好的那件事';
      const promise = latestPromise(state, npc.id);
      prompt = !promise ? '承诺要说清楚，也得真的做到。现在你想怎么安排？'
        : promise.status === 'broken' ? `你答应让我${promiseLabel(promise.kind)}，期限过了还没做到。我们再谈谈？`
          : `还记得答应让我${promiseLabel(promise.kind)}吗？我想确认一下安排。`; break;
    }
  }
  // Personality may color a request, but must not replace its work/need/topic.
  prompt = personalityAcknowledgement(npc, prompt);
  prompt = truthfulVillageSpeech(state, npc, prompt);
  return { title, prompt, participants: [...new Set(participants)] };
}

function newThread(state: GameState, npc: Npc, kind: SocialKind, proactive: boolean): SocialThread {
  refreshCampMind(state, npc);
  const details = promptFor(state, npc, kind);
  const thread: SocialThread = { id: state.social.nextId++, kind, initiator: npc.id, ...details,
    createdAt: state.elapsed, expiresAt: state.elapsed + REQUEST_LIFETIME,
    status: 'open', revision: 0, lines: [], choiceId: null, resolution: '' };
  state.social.threads.push(thread);
  if (state.social.threads.length > SOCIAL_LIMITS.threads) state.social.threads.splice(0, state.social.threads.length - SOCIAL_LIMITS.threads);
  if (!proactive) say(state, thread, 'player', `我想和你聊聊${thread.title.replace('？', '')}。`);
  say(state, thread, npc.id, thread.prompt);
  const concernKind = concernForKind(kind);
  const concern = npc.mind?.concerns.find(item => item.kind === concernKind && item.status !== 'resolved');
  if (concern) (state.social.people[npc.id].lastConcernPrompts ??= {})[concern.kind] = concern.id;
  if (kind === 'fairness' && thread.participants.length > 1) {
    const burdened = mostBurdened(state, thread);
    if (burdened.id !== npc.id) say(state, thread, burdened.id, '我愿意出力，也希望下一轮能有人接手。');
  }
  npc.emotion = kind === 'help' ? 'caring' : kind === 'explore' ? 'happy'
    : kind === 'fairness' || kind === 'promise' && latestPromise(state, npc.id)?.status === 'broken' ? 'annoyed'
      : ['rest', 'food', 'weather'].includes(kind) ? 'worried' : 'calm';
  if ((npc.mind?.emotions.anger ?? 0) > .3) npc.emotion = 'annoyed';
  state.social.people[npc.id].cooldownUntil = state.elapsed + 30;
  state.social.revision++;
  if (proactive) {
    state.social.stats.initiated++;
    event(state, `${npc.name}来找你商量：${thread.title}`, npc.id);
  }
  return thread;
}

function closeWithoutPenalty(state: GameState, thread: SocialThread, reason: string) {
  thread.status = 'resolved'; thread.resolution = reason; thread.revision++; state.social.revision++;
}

function openConversation(state: GameState, npc: Npc, topic: SocialTopic) {
  const kind = kindForTopic(state, npc, topic);
  const recent = state.social.threads.filter(thread => thread.initiator === npc.id).at(-1);
  // One decision per encounter: repeated clicks and topic switching while paused
  // must not farm trust or duplicate rewards from a resolved conversation.
  if (recent?.choiceId && state.elapsed - (recent.lines.at(-1)?.at ?? recent.createdAt) < 6) return;
  const existing = state.social.threads.find(thread => thread.initiator === npc.id && thread.status === 'open');
  if (existing?.kind === kind || existing && topic === 'checkin') return;
  if (existing) closeWithoutPenalty(state, existing, '转而讨论新的安排，之前的话题暂且放下。');
  if (kind === 'fairness') for (const shared of state.social.threads) {
    if (shared.status === 'open' && shared.kind === 'fairness') closeWithoutPenalty(state, shared, '同一分工问题已转入当前讨论，不重复处理。');
  }
  const open = state.social.threads.filter(thread => thread.status === 'open');
  if (open.length >= 2) closeWithoutPenalty(state, open[0], '你先去与另一位伙伴商量，这件事暂由伙伴自主处理。');
  newThread(state, npc, kind, false);
}

export function cancelSocialAgreement(state: GameState, npcId: NpcId) {
  const length = state.social.agreements.length;
  state.social.agreements = state.social.agreements.filter(agreement => agreement.npcId !== npcId);
  if (length !== state.social.agreements.length) state.social.revision++;
}

function arrange(state: GameState, thread: SocialThread, npc: Npc, action: ActionId, targetId?: NpcId) {
  cancelSocialAgreement(state, npc.id);
  noticeCampOrder(state, npc, action);
  const agreement: SocialAgreement = { id: state.social.nextId++, npcId: npc.id, threadId: thread.id,
    action, createdAt: state.elapsed, until: state.elapsed + (['wood','food','explore'].includes(action)?180:45), ...(targetId ? { targetId } : {}) };
  state.social.agreements.push(agreement);
  npc.command = action;
  if (!npc.inventory.wood && !npc.inventory.food && npc.action !== action) {
    npc.previousAction = npc.action ?? npc.previousAction ?? null;
    if (npc.action !== null) state.stats.taskSwitches++;
    npc.action = null; npc.progress = 0; npc.actionDuration = 0; npc.decisionIn = 0;
    npc.destination = { ...npc.position };
  }
  delete npc.manualTarget;
  npc.decisionIn = 0;
  npc.decisionTrigger = 'social';
  memory(state, npc.id, thread.id, 'agreement', `你向${npc.name}提出「${ACTION_LABELS[action]}」安排；伙伴仍会判断是否接受，等待实际完成。`, targetId);
  if (!thread.participants.includes(npc.id)) thread.participants.push(npc.id);
  state.social.revision++;
}

function promiseTo(state: GameState, thread: SocialThread, npc: Npc, kind: SocialPromise['kind']) {
  state.social.promises.push({ id: state.social.nextId++, npcId: npc.id, threadId: thread.id, kind,
    createdAt: state.elapsed, dueAt: state.elapsed + PROMISE_LIFETIME, status: 'pending', fulfilledAt: null });
  if (state.social.promises.length > SOCIAL_LIMITS.promises) {
    const old = state.social.promises.findIndex(promise => promise.status !== 'pending');
    if (old >= 0) state.social.promises.splice(old, 1);
  }
  memory(state, npc.id, thread.id, 'agreement', `你答应在限定时间内让${npc.name}${promiseLabel(kind)}，尚未兑现。`);
  if (!thread.participants.includes(npc.id)) thread.participants.push(npc.id);
  state.social.revision++;
}

/** Only real consumption/completed rest reaches this function. Words never fulfil a promise. */
export function fulfillSocialPromises(state: GameState, npc: Npc, kind: SocialPromise['kind']) {
  for (const promise of state.social.promises) {
    if (promise.npcId !== npc.id || promise.kind !== kind || promise.status !== 'pending' || state.elapsed > promise.dueAt) continue;
    promise.status = 'kept'; promise.fulfilledAt = state.elapsed; state.social.stats.kept++;
    recordMindEvent(state, npc, 'promise_kept', `玩家兑现了${promiseLabel(kind)}的承诺。`, kind === 'rest' ? 'rest' : 'food');
    memory(state, npc.id, promise.threadId, 'promise_kept', `你兑现了承诺：${npc.name}确实${promiseLabel(kind)}了。`);
    event(state, `${npc.name}记住了这次兑现的承诺。`, npc.id, 'good');
    state.social.revision++;
  }
}

function shareMeal(state: GameState, npc: Npc) {
  state.food--; state.stats.meals++;
  npc.hunger = clamp(npc.hunger - MEAL_RELIEF); npc.energy = clamp(npc.energy + 8);
  npc.health = clamp(npc.health + 4); changeTrust(state, npc, 4);
  npc.lastInteraction = Math.max(.001, state.elapsed);
  // A half-finished self-service meal cannot consume a second ration after this one.
  if (npc.action === 'eat') { npc.action = null; npc.progress = 0; npc.actionDuration = 0; npc.decisionIn = 0; }
  fulfillSocialPromises(state, npc, 'meal');
  event(state, `你给${npc.name}分了一份食物。`, npc.id, 'good');
}

function distributeWork(state: GameState, thread: SocialThread, action: 'wood' | 'food') {
  const initiator = member(state, thread.initiator);
  const worker = helper(state, initiator.id, action) ?? (!actionProblem(state, initiator, action) ? initiator : undefined);
  if (worker) arrange(state, thread, worker, action);
  return worker;
}

function reply(state: GameState, thread: SocialThread, choiceId: string) {
  const choice = getSocialChoices(state, thread).find(item => item.id === choiceId);
  if (!choice || choice.disabledReason) return;
  const npc = member(state, thread.initiator);
  const burdened = mostBurdened(state, thread);
  let resolution = '';
  let response = '安排记下了，我会留意身体和村寨的口粮。';
  say(state, thread, 'player', choice.label);
  if (choiceId === 'deny' || choiceId === 'verify') {
    respondToPlayerIntent(state, thread, npc, choiceId === 'deny' ? 'deny_rest' : 'verify');
    state.social.stats.replied++;
    return;
  }
  if (thread.kind === 'checkin' && choiceId === 'plan') {
    const details = promptFor(state, npc, 'work');
    thread.kind = 'work'; thread.title = details.title; thread.prompt = details.prompt;
    say(state, thread, npc.id, details.prompt); state.social.revision++; state.social.stats.replied++;
    return;
  }
  if (choiceId === 'rest' || thread.kind === 'weather' && choiceId === 'shelter') {
    arrange(state, thread, npc, 'rest');
    resolution = `已安排${npc.name}回屋休息，抵达自己的民居并恢复后才记录成果。`;
    response = npc.id === 'azhuang' ? '那我先缓一缓，之后再接着出力。' : npc.id === 'linlan' ? '这还差不多，我先歇着。' : npc.id === 'laozhou' ? '行，我先缓缓，活你再找人安排。' : '好，我先去歇脚。';
  } else if (thread.kind === 'rest' && choiceId === 'swap' || thread.kind === 'fairness' && choiceId === 'rotate') {
    const tired = thread.kind === 'rest' ? npc : burdened;
    const action = tired.action && WORK.has(tired.action) ? tired.action : 'wood';
    const replacement = replacementFor(state, tired, action)!;
    arrange(state, thread, tired, 'rest'); arrange(state, thread, replacement, action);
    changeTrust(state, tired, 3); relationship(state, tired.id, replacement.id, 3);
    resolution = `${tired.name}先休息，${replacement.name}接一轮「${ACTION_LABELS[action]}」。`;
    response = '轮班说清楚就好，大家都别硬撑。';
  } else if (choiceId === 'promise' && ['rest', 'food', 'fairness'].includes(thread.kind)) {
    const target = thread.kind === 'fairness' ? burdened : npc;
    const kind = thread.kind === 'food' ? 'meal' : 'rest';
    promiseTo(state, thread, target, kind);
    resolution = `已承诺让${target.name}${promiseLabel(kind)}。请在期限内落实，不会自动替你安排。`;
    response = '那我们说好了，我会记着，也等你把它做到。';
  } else if (thread.kind === 'food' && choiceId === 'feed') {
    shareMeal(state, npc); resolution = `${npc.name}吃到 1 份食物，已从仓库库存扣除。`; response = '这份食物来得及时，谢谢你。';
  } else if (thread.kind === 'food' && choiceId === 'gather' || thread.kind === 'work') {
    state.priority = choiceId === 'balanced' ? 'balanced' : choiceId === 'wood' ? 'wood' : 'food';
    const action = choiceId === 'balanced' ? state.food < 4 ? 'food' : 'wood' : choiceId === 'wood' ? 'wood' : 'food';
    const worker = distributeWork(state, thread, action);
    resolution = worker ? `已调整村寨分工，${worker.name}接一轮「${ACTION_LABELS[action]}」，收获送到仓库才入库。` : '已恢复均衡安排，口粮不足时先补粮。';
    response = '方向清楚了，我们照着需要分开行动。';
    changeTrust(state, npc, 1);
  } else if (thread.kind === 'weather' && choiceId === 'continue') {
    recordMindEvent(state, npc, 'request_denied', '玩家要求在担忧天气安全时继续原安排。', 'safety');
    reconsiderAfterSpeech(state, npc); resolution = '已经提出继续工作的要求；伙伴会按安全、情绪和立场自主判断。'; response = campExpression(npc, '安全问题我记着，是否继续得看实际情况。');
  } else if (thread.kind === 'fairness' && choiceId === 'maintain') {
    recordMindEvent(state, burdened, 'request_denied', '玩家明确维持有争议的分工。', 'fairness');
    reconsiderAfterSpeech(state, burdened);
    if (npc.id !== burdened.id) {
      recordMindEvent(state, npc, 'request_denied', '提出分工异议后，玩家仍决定维持。', 'fairness');
      reconsiderAfterSpeech(state, npc);
    }
    for (const id of thread.participants) if (id !== burdened.id) relationship(state, burdened.id, id, -2);
    resolution = '工作没有变化；承担更多的伙伴仍对分工有意见。'; response = '我听到了，但这个分工的问题还在。';
  } else if (thread.kind === 'help') {
    const target = injuredPartner(state, npc);
    const worker = choiceId === 'delegate' && target ? helper(state, npc.id, 'help', target.id) : npc;
    if (!target || !worker || worker.id === target.id) return;
    if (choiceId === 'delegate') arrange(state, thread, npc, 'rest');
    arrange(state, thread, worker, 'help', target.id);
    resolution = `${worker.name}去照顾${target.name}，实际完成治疗才会改善伤势与彼此关系。`; response = '有人照顾他，我心里就有底了。';
  } else if (thread.kind === 'explore') {
    const action = choiceId === 'explore' ? 'explore' : 'camp';
    arrange(state, thread, npc, action);
    changeTrust(state, npc, choiceId === 'explore' ? 3 : -1);
    resolution = action === 'explore' ? '约定一趟探索；带回补给后结束，超时或身体不适会召回。' : `已安排${npc.name}返营，暂缓探路。`;
    response = action === 'explore' ? '好！我探一趟就回，身体不对劲就撤。' : '行，先回营地。之后也听听我的新主意吧。';
  } else if (thread.kind === 'promise') {
    const promise = latestPromise(state, npc.id);
    if (choiceId === 'fulfil' && promise) {
      if (promise.kind === 'meal') shareMeal(state, npc); else arrange(state, thread, npc, 'rest');
      resolution = promise.kind === 'meal' ? '这次分食已落实，过往失约记录仍保留。' : '已开始安排休息，完成后再判断当前承诺是否兑现。';
      response = '我看见你在补上这件事了，接下来也请记得。';
    } else if (choiceId === 'renew' && promise) {
      promiseTo(state, thread, npc, promise.kind); resolution = '已建立新的明确期限，之前的失约不会被覆盖。'; response = '再给这次安排一点时间，请别又忘了。';
    } else {
      resolution = '说明了眼前的困难。承诺的事实和期限保持原样，接下来仍看实际行动。'; response = '原因我听到了。说好的事，还是希望你能做到。';
    }
  } else {
    changeTrust(state, npc, 2 + PERSONAS[npc.id].traits.recognition);
    resolution = `你听取了${npc.name}的想法，当前任务保持原样。`;
    response = npc.id === 'azhuang' ? '你记得我的付出，我就觉得这份力没白出。' : '谢谢你愿意停下来听我说。';
  }
  thread.status = 'resolved'; thread.choiceId = choiceId; thread.resolution = resolution.slice(0, SOCIAL_LIMITS.text);
  // Keep the response to the selected arrangement even when the NPC is upset.
  say(state, thread, npc.id, personalityAcknowledgement(npc, response));
  for (const id of thread.participants) memory(state, id, thread.id, 'choice', resolution);
  state.social.stats.replied++; state.social.stats.resolved++; state.social.revision++;
  state.social.people[npc.id].cooldownUntil = Math.max(state.social.people[npc.id].cooldownUntil, state.elapsed + 25);
  event(state, resolution, npc.id, 'info');
}

function reconsiderAfterSpeech(state: GameState, npc: Npc) {
  const action = npc.command ?? npc.action ?? 'camp';
  const evaluated = decideCampBehavior(state, npc, { action, emotion: npc.emotion, source: 'rules', latencyMs: 0,
    scores: ['wood', 'food', 'fire', 'eat', 'rest', 'help', 'camp', 'explore'].map(candidate => Number(candidate === action)) }, getAllowedActions(state, npc));
  // 说完话仍决定继续原事，就保留真实进度；只有改变行为才中断这一轮劳动。
  if (evaluated.result.action !== npc.action) requestMindReview(state, npc);
  else { npc.decisionTrigger = 'social'; npc.decisionIn = 0; }
  publishCampExpression(state, npc);
}

/** 按钮和明确文本落入同一事件入口；同一句模糊闲聊不会偷偷安排工作。 */
function respondToPlayerIntent(state: GameState, thread: SocialThread, npc: Npc, intent: PlayerIntent) {
  if (intent === 'verify') {
    const hiding = npc.mind?.expression.allowDeception === true && (npc.actionEffort ?? 1) < .7;
    const report = `核查：${npc.name}当前${npc.action ? ACTION_LABELS[npc.action] : '尚未行动'}，有效投入 ${Math.round((npc.actionEffort ?? 1) * 100)}%，背包木材 ${npc.inventory.wood}、食物 ${npc.inventory.food}。`;
    event(state, report, npc.id, hiding ? 'warning' : 'info');
    memory(state, npc.id, thread.id, 'choice', report);
    if (hiding) {
      recordMindEvent(state, npc, 'deception_exposed', '玩家核查实际投入，发现我的说辞掩饰了低投入。');
      reconsiderAfterSpeech(state, npc);
      say(state, thread, npc.id, npc.id === 'laozhou' ? '你倒盯得紧。干活总得讲方法，进度慢也不能全赖我。' : '行，你看到了，我确实没全力干。');
    } else say(state, thread, npc.id, report);
  } else if (intent === 'grant_rest') {
    const problem = actionProblem(state, npc, 'rest');
    if (problem) { say(state, thread, npc.id, `现在还得先处理：${problem}。`); return; }
    arrange(state, thread, npc, 'rest');
    reconsiderAfterSpeech(state, npc);
    say(state, thread, npc.id, campExpression(npc, '这次我先休息，是否恢复得看实际情况。'));
  } else {
    const hasRest = refreshCampMind(state, npc).concerns.some(concern => concern.kind === 'rest' && concern.status !== 'resolved');
    if (intent === 'deny_rest' || intent === 'urge' && hasRest) recordMindEvent(state, npc, 'request_denied', '玩家明确要求不休息、继续工作。', 'rest');
    else if (intent === 'urge') recordMindEvent(state, npc, 'urged', '玩家明确催促继续干活。');
    else recordMindEvent(state, npc, 'apologized', '玩家承认安排不妥并道歉；原有诉求与失约仍然保留。');
    reconsiderAfterSpeech(state, npc);
    say(state, thread, npc.id, campExpression(npc, intent === 'apologize' ? '道歉我听到了，接下来还要看安排有没有真正改变。' : '这次安排我会按眼前的情况作决定。'));
  }
  thread.resolution = '已记下这次交流，具体恢复和工作成果仍由实际行动决定。';
  thread.expiresAt = state.elapsed + REQUEST_LIFETIME;
  state.social.revision++;
}

/** Called only on the engine's cloned, active/paused state. Player text stays data. */
export function handleSocialCommand(state: GameState, command: GameCommand) {
  if (!['playing', 'paused'].includes(state.status)) return;
  if (command.type === 'social-open') {
    const npc = state.npcs.find(item => item.id === (command.npcId ?? state.selectedNpc));
    const topic = command.topic ?? 'checkin';
    if (!npc?.alive || !['checkin', 'work', 'food', 'weather', 'conflict', 'promise'].includes(topic)) return;
    state.selectedNpc = npc.id; openConversation(state, npc, topic); return;
  }
  const thread = state.social.threads.find(item => item.id === command.threadId);
  if (!thread || thread.status !== 'open' || !member(state, thread.initiator)?.alive) return;
  if (command.type === 'social-reply' && typeof command.choiceId === 'string') reply(state, thread, command.choiceId);
  if (command.type === 'social-chat' && typeof command.text === 'string') {
    const text = command.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160);
    if (!text) return;
    say(state, thread, 'player', text);
    const npc = member(state, thread.initiator);
    const intent = parsePlayerIntent(text);
    if (intent) { respondToPlayerIntent(state, thread, npc, intent); state.social.stats.replied++; return; }
    const response = latestPromise(state, npc.id)?.status === 'broken' ? '你的话我听到了。之前说好的事，也请用行动补上。'
      : npc.id === 'xiaomi' ? '我听到了。能把安全和退路也一起安排清楚吗？'
        : npc.id === 'aye' ? '我听到了。也想让你考虑一下我提出的办法。'
          : npc.id === 'laozhou' ? '话先说清楚，要我承担什么，也得说说怎么补偿。'
            : npc.id === 'linlan' ? '别绕来绕去，又要让我干什么？' : '咱们把这轮怎么干商量清楚。';
    say(state, thread, npc.id, campExpression(npc, response)); state.social.revision++;
  }
}

/** Returns a legal one-shot commitment; engine reports its source as rules. */
export function getSocialAgreement(state: GameState, npc: Npc): SocialAgreement | undefined {
  const agreement = state.social.agreements.find(item => item.npcId === npc.id && item.until >= state.elapsed);
  if (!agreement) return undefined;
  const target = agreement.targetId ? member(state, agreement.targetId) : undefined;
  const targetRecovered = agreement.action === 'help' && agreement.targetId
    && (!target?.alive || !target.injured && target.health >= 65);
  if (targetRecovered || actionProblem(state, npc, agreement.action)) {
    // Do not discard a rest agreement during its committed delivery leg.
    if (npc.inventory.wood || npc.inventory.food) return undefined;
    cancelSocialAgreement(state, npc.id);
    if (npc.command === agreement.action) npc.command = null;
    memory(state, npc.id, agreement.threadId, 'agreement', `原先商定的「${ACTION_LABELS[agreement.action]}」因当前身体、天气或任务条件变化暂缓。`);
    event(state, `${npc.name}暂缓约定任务，先按当前需要行动。`, npc.id, 'warning');
    return undefined;
  }
  return agreement;
}

export function recordSocialAction(state: GameState, npc: Npc, action: ActionId, targetId?: NpcId) {
  collectiveActionCompleted(state,npc.id,action);
  if (state.agency) remember(state, npc.id, 'action', `实际完成「${ACTION_LABELS[action]}」${targetId ? `，帮助了${member(state, targetId).name}` : ''}。`);
  const person = state.social.people[npc.id];
  if (WORK.has(action)) {
    person.workload = clamp(person.workload + (action === 'explore' ? 11 : action === 'wood' || action === 'food' ? 8 : 5));
    recordMindEvent(state, npc, 'work_completed', `实际完成一轮${ACTION_LABELS[action]}；运回的物资才计入库存。`, undefined, npc.id);
  }
  if (action === 'rest') { person.workload = clamp(person.workload - 9); refreshCampMind(state, npc); fulfillSocialPromises(state, npc, 'rest'); }
  if (action === 'eat') fulfillSocialPromises(state, npc, 'meal');
  const agreement = state.social.agreements.find(item => item.npcId === npc.id && item.action === action && item.until >= state.elapsed
    && (item.targetId === undefined || item.targetId === targetId));
  if (agreement) {
    cancelSocialAgreement(state, npc.id);
    memory(state, npc.id, agreement.threadId, 'agreement', `${npc.name}实际完成了与你商定的「${ACTION_LABELS[action]}」。`, targetId);
    changeTrust(state, npc, 2);
  }
  if (action === 'help' && targetId) {
    const target = member(state, targetId);
    recordMindEvent(state, target, 'help_received', `${npc.name}实际完成了照顾，伤势有所恢复。`, 'safety', npc.id);
    let threadId = agreement?.threadId;
    if (!threadId) {
      // Autonomous care has its own factual record, with no invented player
      // request, promise, cooldown, or stale "I want to help" caption.
      const thread: SocialThread = { id: state.social.nextId++, kind: 'help', initiator: npc.id,
        participants: [npc.id, targetId], title: '刚刚发生的互助', prompt: '', createdAt: state.elapsed,
        expiresAt: state.elapsed, status: 'resolved', revision: 0, lines: [], choiceId: null,
        resolution: `${npc.name}实际照顾了${target.name}。` };
      state.social.threads.push(thread);
      if (state.social.threads.length > SOCIAL_LIMITS.threads) state.social.threads.splice(0, state.social.threads.length - SOCIAL_LIMITS.threads);
      say(state, thread, targetId, `谢谢${npc.name}刚才照顾我，我现在好多了。`);
      threadId = thread.id;
    }
    relationship(state, targetId, npc.id, 9); relationship(state, npc.id, targetId, 4);
    memory(state, targetId, threadId, 'help', `${npc.name}实际照顾了我，伤势有所恢复。`, npc.id);
    memory(state, npc.id, threadId, 'help', `我照顾了${target.name}，他的伤势有所恢复。`, targetId);
    state.social.revision++;
  }
}

export function recordSocialInteraction(state: GameState, npc: Npc, type: 'feed' | 'praise' | 'urge') {
  if (type === 'feed') fulfillSocialPromises(state, npc, 'meal');
  if (type === 'urge') {
    recordMindEvent(state, npc, 'urged', '玩家催促加快工作。');
    reconsiderAfterSpeech(state, npc);
  }
  if (type === 'praise') recordMindEvent(state, npc, 'praised', '玩家肯定了我的付出。');
}

function expirePromise(state: GameState, promise: SocialPromise) {
  promise.status = 'broken'; state.social.stats.broken++;
  const npc = member(state, promise.npcId);
  recordMindEvent(state, npc, 'promise_broken', `玩家承诺让我${promiseLabel(promise.kind)}，却没在期限内做到。`, promise.kind === 'rest' ? 'rest' : 'food');
  reconsiderAfterSpeech(state, npc);
  memory(state, npc.id, promise.threadId, 'promise_broken', `你答应让我${promiseLabel(promise.kind)}，但在期限内没有做到。`);
  event(state, `你对${npc.name}的承诺到期未兑现。`, npc.id, 'warning');
  state.social.revision++;
}

function concernForKind(kind: SocialKind): ConcernKind | undefined {
  return kind === 'weather' ? 'safety' : kind === 'rest' || kind === 'food' || kind === 'fairness' ? kind : undefined;
}

/** 一轮需要只主动问一次。已说出的诉求由后续行动/回应推进，不靠定时器重开。 */
function canPromptConcern(state: GameState, npc: Npc, kind: ConcernKind): boolean {
  const concern = npc.mind?.concerns.find(item => item.kind === kind && item.status === 'open');
  return !!concern && state.social.people[npc.id].lastConcernPrompts?.[kind] !== concern.id;
}

function proactiveCandidate(state: GameState): { npc: Npc; kind: SocialKind } | undefined {
  const candidates: { npc: Npc; kind: SocialKind; score: number }[] = [];
  const burdened = mostBurdened(state);
  const lowWork = Math.min(...state.npcs.filter(npc => npc.alive).map(npc => state.social.people[npc.id].workload));
  for (const npc of state.npcs) {
    if (!npc.alive || state.social.people[npc.id].cooldownUntil > state.elapsed || state.social.threads.some(thread => thread.initiator === npc.id && thread.status === 'open')) continue;
    const traits = { ...PERSONAS[npc.id].traits, fairness: getCampProfile(npc).traits.fairness };
    const person = state.social.people[npc.id];
    const pending = latestPromise(state, npc.id);
    if (pending?.status === 'broken' && !state.social.threads.some(thread => thread.kind === 'promise' && thread.initiator === npc.id && thread.createdAt >= pending.dueAt)) candidates.push({ npc, kind: 'promise', score: 100 });
    if (canPromptConcern(state, npc, 'food')) candidates.push({ npc, kind: 'food', score: npc.hunger + traits.sensitivity * 10 });
    if (canPromptConcern(state, npc, 'rest')) candidates.push({ npc, kind: 'rest', score: 105 - npc.energy + person.workload * .5 + traits.recognition * 6 });
    if (canPromptConcern(state, npc, 'safety')) candidates.push({ npc, kind: 'weather', score: npc.fear + npc.wetness * .25 + traits.sensitivity * 28 });
    if (injuredPartner(state, npc) && getCampProfile(npc).traits.empathy > .65) candidates.push({ npc, kind: 'help', score: 55 + getCampProfile(npc).traits.empathy * 15 });
    if (canPromptConcern(state, npc, 'fairness') && (state.social.people[burdened.id].workload - lowWork > 17 || person.resentment > 18)
      && !state.social.threads.some(thread => thread.status === 'open' && thread.kind === 'fairness')) candidates.push({ npc, kind: 'fairness', score: 45 + traits.fairness * 25 + person.resentment });
    if (traits.curiosity > .8 && !hasCustomCampTraits(npc) && !actionProblem(state, npc, 'explore')) candidates.push({ npc, kind: 'explore', score: 48 + traits.curiosity * 10 });
    // Quiet work needs no periodic check-in. Players can still initiate one.
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

/** Simulation time, never wall time. Requests don't pause or replace autonomous work. */
export function updateSocial(state: GameState) {
  if (state.status !== 'playing') return;
  // Only commitments involving unavailable characters end; living companions keep theirs.
  const unavailable = new Set(state.npcs.filter(npc => !npc.alive || npc.health <= 0).map(npc => npc.id));
  for (const promise of state.social.promises) if (promise.status === 'pending' && unavailable.has(promise.npcId)) {
    promise.status = 'cancelled'; state.social.revision++;
  }
  state.social.agreements = state.social.agreements.filter(agreement => !unavailable.has(agreement.npcId)
    && (!agreement.targetId || !unavailable.has(agreement.targetId)));
  for (const thread of state.social.threads) if (thread.status === 'open' && unavailable.has(thread.initiator)) {
    closeWithoutPenalty(state, thread, '伙伴已离世，这次交流结束；营地生活仍在继续。');
  }
  for (const npc of state.npcs) if (npc.alive) refreshCampMind(state, npc);
  for (const promise of state.social.promises) if (promise.status === 'pending' && state.elapsed > promise.dueAt) expirePromise(state, promise);
  for (const agreement of [...state.social.agreements]) {
    if (agreement.until >= state.elapsed) continue;
    const npc = member(state, agreement.npcId);
    cancelSocialAgreement(state, npc.id);
    if (npc.command === agreement.action) npc.command = null;
    if (agreement.action === 'explore' && npc.action === 'explore' && !npc.inventory.wood && !npc.inventory.food) {
      npc.previousAction = npc.action; npc.action = null; npc.command = 'camp';
      npc.progress = 0; npc.actionDuration = 0; npc.decisionIn = 0; npc.decisionTrigger = 'social';
      state.social.agreements.push({ id: state.social.nextId++, npcId: npc.id, threadId: agreement.threadId,
        action: 'camp', createdAt: state.elapsed, until: state.elapsed + 45 });
      event(state, `${npc.name}的探索约定到时，开始返营。`, npc.id);
    }
    memory(state, npc.id, agreement.threadId, 'agreement', `「${ACTION_LABELS[agreement.action]}」的约定时段结束，未记为完成。`);
  }
  if (state.elapsed < state.social.nextCheckAt) return;
  state.social.nextCheckAt = state.elapsed + 1;
  for (const thread of state.social.threads) {
    if (thread.status !== 'open') continue;
    const npc = member(state, thread.initiator);
    const solved = thread.kind === 'food' && npc.hunger < 35 || thread.kind === 'rest' && npc.energy > 76 && state.social.people[npc.id].workload < 15
      || thread.kind === 'help' && !injuredPartner(state, npc);
    if (!npc.alive || solved && state.elapsed - thread.createdAt > 6) {
      closeWithoutPenalty(state, thread, npc.alive ? '伙伴已经按自己的需要处理了这件事。你们之后仍可以主动聊聊。' : '这次交流已经结束。'); continue;
    }
    if (state.elapsed < thread.expiresAt) continue;
    thread.status = 'expired'; thread.resolution = '这次没有等到回应，伙伴继续按自己的需要行动。'; thread.revision++;
    state.social.stats.ignored++;
    const concern = concernForKind(thread.kind);
    if (concern) {
      recordMindEvent(state, npc, 'request_denied', '这一轮诉求到期仍未得到回应，需要自行决定怎么办。', concern);
      reconsiderAfterSpeech(state, npc);
    } else changeTrust(state, npc, -1);
    memory(state, npc.id, thread.id, 'ignored', '我提出的请求没有等到回应，后来自己继续安排。'); state.social.revision++;
  }
  if (state.elapsed < state.social.nextPromptAt || state.social.threads.filter(thread => thread.status === 'open').length >= 2) return;
  if (!state.social.introduced) {
    state.social.introduced = true;
    const npc = state.npcs.find(npc => npc.id === 'linlan' && npc.alive) ?? state.npcs.find(npc => npc.alive);
    if (npc && state.social.people[npc.id].cooldownUntil <= state.elapsed
      && !state.social.threads.some(thread => thread.status === 'open' && thread.initiator === npc.id)) newThread(state, npc, 'work', true);
    state.social.nextPromptAt = state.elapsed + 18;
    return;
  }
  const candidate = proactiveCandidate(state);
  if (candidate) { newThread(state, candidate.npc, candidate.kind, true); state.social.nextPromptAt = state.elapsed + 18; }
}
