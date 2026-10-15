import type { GameState, Npc, NpcId } from '../simulation/types';
import { ACTION_LABELS, EMOTION_LABELS } from '../simulation/constants';
import { customCampPersona, hasCustomCampTraits,getCampProfile } from '../npc/profiles';
import { PERSONAS } from '../simulation/personalities';
import { VILLAGE_CONTEXT_VERSION, villageFacts, villageActionSpeech, obsoleteVillageText, survivalExecution } from '../npc/world-context';
import type { DialoguePayload } from '../../../../packages/npc-dialogue/src/types';
import { retrieveMemories } from '../../../../packages/npc-core/src';
export type { DialoguePayload } from '../../../../packages/npc-dialogue/src/types';

export interface DialogueTicket {
  npcId: NpcId; revision: string; fingerprint: string; intentFingerprint: string; key: string; payload: DialoguePayload;
  threadId?: number; lineId?: number; threadRevision?: number;
}
const WEATHER = { clear: '晴朗', wind: '山风', rain: '阵雨', storm: '雷暴' };
// Re-showing the same immediate caption does not change its meaning.
export const revision = (npc: Npc) => npc.speech;
export function captionWithinWindow(npc: Pick<Npc, 'speechUntil'>, elapsed: number, threadId?: number) {
  return npc.speechUntil > elapsed || threadId === undefined && npc.speechUntil + 12 > elapsed;
}
function mindMeaning(npc: Npc) {
  const mind = npc.mind; if (!mind) return null;
  const { kind, actionId, reason } = mind.intent;
  const { revision: _revision, ...expression } = mind.expression;
  // lastEventSequence is a shared-log read cursor, including other actors' events.
  // Intent/expression/concerns carry this actor's actual semantic changes.
  return [{ kind, actionId, reason }, expression,
    mind.concerns.map(concern => [concern.kind, concern.status, concern.denials])];
}
const needs = (npc: Npc) => [npc.hunger > 72 ? '很饿' : npc.hunger > 40 ? '有些饿' : '不饿',
  npc.energy < 22 ? '精疲力尽' : npc.energy < 50 ? '有些疲劳' : '体力充足',
  npc.health < 40 ? '伤势严重' : npc.injured ? '受了伤' : '身体正常',
  npc.trust < 35 ? '不太信任玩家' : npc.trust > 70 ? '信任玩家' : '对玩家信任一般'];
const CONCERNS = { rest: '休息', food: '进食', fairness: '分工', safety: '安全' };
const bounded = (text: string, length: number) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, length);
export function socialBinding(state: GameState, npc: Npc) {
  for (const thread of [...state.social.threads].reverse()) {
    if (!thread.participants.includes(npc.id)) continue;
    const line = [...thread.lines].reverse().find(item => item.speaker === npc.id);
    if (line) return line.text === npc.speech ? { thread, line } : undefined;
  }
  return undefined;
}
export function seenRevision(state: GameState, npc: Npc): string {
  const binding = socialBinding(state, npc);
  // 暂停时多条消息可能共享台词和模拟时间；必须加入记录行与心智修订，
  // 让新的拒绝或情绪变化立即作废上一条在途回复。
  const semantic = JSON.stringify(mindMeaning(npc));
  return binding ? `${revision(npc)}:${binding.thread.id}:${binding.thread.revision}:${binding.line.id}:${semantic}` : `${npc.speechUntil}:${revision(npc)}:${semantic}`;
}
function socialFingerprint(state: GameState, npc: Npc) {
  const binding = socialBinding(state, npc);
  // Other characters' conversations cannot invalidate this character's caption.
  return [binding && [binding.thread.id, binding.thread.revision,
    binding.thread.status, binding.thread.choiceId, binding.thread.resolution, binding.line.id]];
}
export const fingerprint = (state: GameState, npc: Npc) => JSON.stringify([
  VILLAGE_CONTEXT_VERSION, ...villageFacts(state, npc),
  npc.action, npc.command, npc.mind ? npc.mind.expression.tone : npc.emotion, state.weather, state.atmosphere.revision,
  npc.lastInteraction, npc.collision?.lastHit?.time, npc.collision?.lastHit?.objectId, ...needs(npc),
  ...socialFingerprint(state, npc),
  mindMeaning(npc),
]);
/** Physical movement/weather may change while a short, fact-neutral candidate is selected. */
export const intentFingerprint = (state: GameState, npc: Npc) => JSON.stringify([
  npc.command, npc.lastInteraction, npc.collision?.lastHit?.time, npc.collision?.lastHit?.objectId,
  ...needs(npc), ...socialFingerprint(state, npc), mindMeaning(npc),
]);

export function createDialogueTicket(state: GameState, npc: Npc): DialogueTicket {
  const binding = socialBinding(state, npc);
  const playerQuestion=binding?.thread.lines.filter(line=>line.speaker==='player').at(-1)?.text;
  const relevant = retrieveMemories(state.agency?.people[npc.id]?.memory.recent ?? [], { npcId:npc.id, now:state.elapsed,
    query:playerQuestion ?? npc.mind?.intent.reason ?? npc.speech, limit:3 });
  const memories = [...new Set([...state.events.filter(e => e.npcId === npc.id && !e.reaction)
    .slice(-2).map(e => bounded(e.text, 150)), ...state.social.memories.filter(m => m.npcId === npc.id)
    .slice(-3).map(m => bounded(m.text, 150))])].slice(-3);
  const payload: DialoguePayload = {
    requestId: '', npcId: npc.id, name: npc.name, persona: bounded(hasCustomCampTraits(npc) ? customCampPersona(npc) : PERSONAS[npc.id].description, 100),
    action: npc.action ?? 'none', emotion: npc.emotion,
    speechStyle:getCampProfile(npc).traits.impulsivity>=.65||getCampProfile(npc).traits.patience<.35
      ?'脾气急，烦了会顶嘴骂粗话，不满不装客气。'
      :getCampProfile(npc).traits.empathy>=.8?'平时温和，生气时克制但会埋怨护短，不说教。'
      :getCampProfile(npc).traits.selfInterest>=.7?'嘴上油滑，吃亏会阴阳怪气、骂几句，先顾自己。':'说话直接，累了会抱怨，忍到头也会骂人。',
    event: bounded(obsoleteVillageText(npc.speech) ? villageActionSpeech(state, npc, npc.action ?? 'camp') : npc.speech, 160),
    worldContext: villageFacts(state, npc),
    facts: [`天气${WEATHER[state.weather]}`, `已决定${npc.action ? ACTION_LABELS[npc.action] : '回应玩家'}`,
      `情绪${EMOTION_LABELS[npc.emotion]}`, ...needs(npc),
      ...(npc.mind?.concerns.some(concern => concern.status !== 'resolved') ? [npc.mind.concerns
        .filter(concern => concern.status !== 'resolved')
        .sort((a, b) => b.denials - a.denials || b.updatedAt - a.updatedAt).slice(0, 2)
        .map(concern => `${CONCERNS[concern.kind]}诉求${concern.status === 'granted' ? '获准但未恢复' : '未解决'}，已被拒绝${concern.denials}次`).join('；')] : [])],
    memories: [...memories, ...(npc.mind?.memories.slice(-3).map(memory => bounded(memory.fact, 100)) ?? []), ...relevant.reverse().map(e=>bounded(e.fact,100))].slice(-5), recentLines: [],
    privateIntent: npc.mind ? `${npc.mind.intent.kind}：${npc.mind.intent.reason}` : undefined,
    publicExpression: survivalExecution(state, npc) ? { kind: 'explanation', tone: npc.emotion === 'annoyed' ? 'irritated' : 'neutral',
      reason: '正在执行生存任务，原有分工意见保留，先补口粮或送物资。', allowDeception: false }
      : npc.mind ? { ...npc.mind.expression } : undefined,
  };
  if (binding) {
    const { thread } = binding;
    payload.socialContext = [thread.title, thread.prompt,
      `知情伙伴：${thread.participants.map(id => state.npcs.find(n => n.id === id)?.name ?? id).join('、')}`,
      thread.status === 'open' ? '明确安排可能已经影响立场；只表达当前事实。' : `当前结果：${thread.resolution || thread.status}`,
      ...state.social.promises.filter(p => p.npcId === npc.id && p.threadId === thread.id)
        .slice(-2).map(p => `约定${p.kind === 'meal' ? '吃饭' : '休息'}：${p.status}`),
    ].slice(0, 6).map(text => bounded(text, 160));
    payload.conversation = thread.lines.slice(-6).map(line => ({
      speaker: line.speaker === 'player' ? '玩家' : state.npcs.find(person => person.id === line.speaker)?.name ?? line.speaker,
      text: bounded(line.text, 100),
    }));
    payload.playerText = bounded([...thread.lines].reverse().find(line => line.speaker === 'player')?.text ?? '', 160);
  }
  return { npcId: npc.id, revision: revision(npc), fingerprint: fingerprint(state, npc), intentFingerprint: intentFingerprint(state, npc),
    key: JSON.stringify(payload), payload, ...(binding ? {
      threadId: binding.thread.id, lineId: binding.line.id, threadRevision: binding.thread.revision,
    } : {}) };
}
