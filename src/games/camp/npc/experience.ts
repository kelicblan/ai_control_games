import { appendExperience, createMemory, type Experience } from '../../../../packages/npc-core/src';
import { type GameState, type NpcId } from '../simulation/types';
import type { AgencyState } from './agency-types';
import { ACTION_LABELS } from '../simulation/constants';
export { validAgency } from './agency-validation';
export function ensureAgency(state: GameState): AgencyState {
  const agency=state.agency ??= { version: 1, enabled: true, cognition: true, modelId: 'minimind3', modelBinding:'dialogue', settingsRevision: 0,
    sequence: 0, pending: [], people: {}, groups: [], nextGroupId: 1 };
  if(agency.modelBinding!=='dialogue'||!agency.modelId||['native:qwen3.5-0.8b','native:qwen3-4b'].includes(agency.modelId)){
    agency.modelBinding='dialogue';agency.cognition=true;agency.modelId='minimind3';agency.settingsRevision++;
  }
  return agency;
}
export function agencyPerson(state: GameState, id: NpcId) {
  const agency = ensureAgency(state), npc = state.npcs.find(n => n.id === id)!;
  return agency.people[id] ??= { memory: createMemory(), lastSpeech: npc.speech, lastTasks: npc.completedTasks,
    lastAction: npc.action, body: [npc.health, npc.energy, npc.hunger], knownWork: {}, appraisal: null,
    appraisalAt: 0, appraisalThrough: 0, assessedThrough: 0, nextAppraisalAt: 0, appraisalStatus: 'idle',
    decision: null, invitation: null, nextInviteAt: 0 };
}
export function remember(state: GameState, npcId: NpcId, category: Experience['category'], fact: string,
  actorId: string = npcId, audience: string[] = [npcId], source: Experience['source'] = 'experienced', interpretation = '', salience = .5, at=state.elapsed) {
  const agency = ensureAgency(state);
  if (agency.pending.length >= 4096) throw new Error('经历待保存队列已满，请先保存世界');
  const sequence = ++agency.sequence;
  const e: Experience = { eventId: `${npcId}:${sequence}`, sequence, at, npcId, category, actorId,
    audience: [...new Set([...audience, npcId])], fact: fact.slice(0, 400), interpretation: interpretation.slice(0, 280),
    evidenceIds: [], source, salience };
  if (appendExperience(agencyPerson(state, npcId).memory, e)) agency.pending.push(e);
  return e;
}
export function rememberSpeech(state: GameState, speaker: NpcId | 'player', text: string, audience: NpcId[], self = false) {
  if (!state.agency) return;
  const name = speaker === 'player' ? '领主' : state.npcs.find(n => n.id === speaker)!.name;
  for (const id of new Set(audience)) remember(state, id, self ? 'self' : 'dialogue', `${name}说：${text}`, speaker, audience,
    self ? 'self' : speaker === id ? 'experienced' : 'heard', '这是发言记录，不是所述事件已经发生的证明。', self ? .25 : .65);
  if (speaker !== 'player') agencyPerson(state, speaker).lastSpeech = text;
}
export function captureExperiences(state: GameState) {
  if (!state.agency) return;
  for (const npc of state.npcs) {
    const p = agencyPerson(state, npc.id);
    if (npc.action !== p.lastAction) remember(state, npc.id, 'action', `实际行动切换为${npc.action ? ACTION_LABELS[npc.action] : '待机'}；精力${Math.round(npc.energy)}，饥饿${Math.round(npc.hunger)}。`);
    p.lastTasks = npc.completedTasks; p.lastAction = npc.action;
    if (npc.speech && npc.speech !== p.lastSpeech) rememberSpeech(state, npc.id, npc.speech, [npc.id], true);
    const body = [npc.health, npc.energy, npc.hunger];
    if (body.some((v, i) => Math.abs(v - p.body[i]) >= 15)) {
      remember(state, npc.id, 'body', `身体变化：健康${Math.round(body[0])}，精力${Math.round(body[1])}，饥饿${Math.round(body[2])}。`, npc.id, [npc.id], 'experienced', '', .55);
      p.body = body;
    }
  }
}
export function reviseSpeechMemory(state: GameState, id: NpcId, before: string, text: string) {
  if (!state.agency) return;
  const suffix = `说：${before}`, replacement = `说：${text}`;
  // Only the latest actual utterance is revisable; no new emotional event is emitted.
  const own = state.agency.people[id]?.memory.recent;
  const original = own && [...own].reverse().find(e => ['dialogue','self'].includes(e.category) && e.actorId === id && e.fact.endsWith(suffix));
  if (!original) return;
  const at=original.at;
  for (const p of Object.values(state.agency.people)) {
    for (const e of p.memory.recent) if (e.actorId === id && e.at === at && e.fact.endsWith(suffix)) {
      if(state.agency.pending.length>=4096)throw new Error('经历修订队列已满');
      e.fact=e.fact.slice(0,-suffix.length)+replacement;e.sequence=++state.agency.sequence;
      p.memory.watermark=e.sequence;state.agency.pending.push(structuredClone(e));
    }
    p.memory.recent.sort((a,b)=>a.sequence-b.sequence);
  }
  state.agency.pending.sort((a,b)=>a.sequence-b.sequence);
  agencyPerson(state, id).lastSpeech = text;
}
