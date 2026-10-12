import type { GameState, Npc, NpcId } from '../game/types';
import { ACTION_LABELS, EMOTION_LABELS } from '../game/constants';
import { PERSONAS } from '../game/personalities';

export interface DialoguePayload {
  requestId: string; npcId: NpcId; name: string; persona: string;
  action: string; emotion: string; event: string;
  facts: string[]; memories: string[]; recentLines: string[];
  socialContext?: string[]; playerText?: string;
}
export interface DialogueReply { requestId: string; text: string; source: 'minimind3'; latencyMs: number }
export type DialogueSource = 'minimind3' | 'cache';
export interface DialogueStatus {
  mode: 'checking' | 'ready' | 'fallback' | 'off'; enabled: boolean;
  generated: number; cached: number; discarded: number; failures: number;
  latencyMs: number; poolSize: number;
  lines: Partial<Record<NpcId, { text: string; source: DialogueSource }>>;
}
export interface DialogueTicket {
  npcId: NpcId; revision: string; fingerprint: string; key: string; payload: DialoguePayload;
  threadId?: number; lineId?: number; threadRevision?: number;
}
export type DialogueTransport = (payload: DialoguePayload, signal: AbortSignal) => Promise<DialogueReply>;

const WEATHER = { clear: '晴朗', wind: '山风', rain: '阵雨', storm: '雷暴' };
const revision = (npc: Npc) => `${npc.speechUntil}:${npc.speech}`;
const needs = (npc: Npc) => [npc.hunger > 72 ? '很饿' : npc.hunger > 40 ? '有些饿' : '不饿',
  npc.energy < 22 ? '精疲力尽' : npc.energy < 50 ? '有些疲劳' : '体力充足',
  npc.health < 40 ? '伤势严重' : npc.injured ? '受了伤' : '身体正常',
  npc.trust < 35 ? '不太信任玩家' : npc.trust > 70 ? '信任玩家' : '愿意合作'];
const bounded = (text: string, length: number) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, length);
function socialBinding(state: GameState, npc: Npc) {
  for (const thread of [...state.social.threads].reverse()) {
    if (!thread.participants.includes(npc.id)) continue;
    const line = [...thread.lines].reverse().find(item => item.speaker === npc.id);
    if (line) return line.text === npc.speech ? { thread, line } : undefined;
  }
  return undefined;
}
function seenRevision(state: GameState, npc: Npc): string {
  const binding = socialBinding(state, npc);
  // Paused messages can intentionally share the same fallback text and time.
  // A new transcript line must still replace the older in-flight response.
  return binding ? `${revision(npc)}:${binding.thread.id}:${binding.thread.revision}:${binding.line.id}` : revision(npc);
}
function socialFingerprint(state: GameState, npc: Npc) {
  const binding = socialBinding(state, npc);
  return [state.social.revision, binding && [binding.thread.id, binding.thread.revision,
    binding.thread.status, binding.thread.choiceId, binding.thread.resolution, binding.line.id]];
}
const fingerprint = (state: GameState, npc: Npc) => JSON.stringify([
  npc.action, npc.command, npc.emotion, state.weather, state.atmosphere.revision,
  npc.lastInteraction, npc.collision?.lastHit?.time, npc.collision?.lastHit?.objectId, ...needs(npc),
  ...socialFingerprint(state, npc),
]);

export function createDialogueTicket(state: GameState, npc: Npc): DialogueTicket {
  const binding = socialBinding(state, npc);
  const memories = [...new Set([...state.events.filter(e => e.npcId === npc.id && !e.reaction)
    .slice(-2).map(e => bounded(e.text, 150)), ...state.social.memories.filter(m => m.npcId === npc.id)
    .slice(-3).map(m => bounded(m.text, 150))])].slice(-3);
  const payload: DialoguePayload = {
    requestId: '', npcId: npc.id, name: npc.name, persona: bounded(PERSONAS[npc.id].description, 100),
    action: npc.action ?? 'none', emotion: npc.emotion, event: bounded(npc.speech, 160),
    facts: [`天气${WEATHER[state.weather]}`, `已决定${npc.action ? ACTION_LABELS[npc.action] : '回应玩家'}`,
      `情绪${EMOTION_LABELS[npc.emotion]}`, ...needs(npc)],
    memories, recentLines: [],
  };
  if (binding) {
    const { thread } = binding;
    payload.socialContext = [thread.title, thread.prompt,
      `知情伙伴：${thread.participants.map(id => state.npcs.find(n => n.id === id)?.name ?? id).join('、')}`,
      thread.status === 'open' ? '尚待明确选择；聊天不执行安排。' : `当前结果：${thread.resolution || thread.status}`,
      ...state.social.promises.filter(p => p.npcId === npc.id && p.threadId === thread.id)
        .slice(-2).map(p => `约定${p.kind === 'meal' ? '吃饭' : '休息'}：${p.status}`),
    ].slice(0, 6).map(text => bounded(text, 160));
    payload.playerText = bounded([...thread.lines].reverse().find(line => line.speaker === 'player')?.text ?? '', 160);
  }
  return { npcId: npc.id, revision: revision(npc), fingerprint: fingerprint(state, npc),
    key: JSON.stringify(payload), payload, ...(binding ? {
      threadId: binding.thread.id, lineId: binding.line.id, threadRevision: binding.thread.revision,
    } : {}) };
}

export function validDialogueLine(text: unknown): text is string {
  return typeof text === 'string' && text.length >= 4 && text.length <= 48
    && /[\u4e00-\u9fff]/.test(text) && /[。！？!?]$/.test(text)
    && !/[<>\n\ufffd]/.test(text) && !/金币|奖励|玩家获得|系统提示|台词[:：]/.test(text);
}

export function applyDialogue(state: GameState, ticket: DialogueTicket, text: string,
  source: DialogueSource = 'minimind3', conversationThreadId: number | null = null): GameState {
  const npc = state.npcs.find(n => n.id === ticket.npcId);
  const thread = state.social.threads.find(item => item.id === ticket.threadId);
  const line = thread?.lines.find(item => item.id === ticket.lineId);
  const pausedConversation = state.status === 'paused' && ticket.threadId !== undefined
    && ticket.threadId === conversationThreadId;
  if ((state.status !== 'playing' && !pausedConversation) || !npc?.alive || !validDialogueLine(text)
    || npc.speech === text || revision(npc) !== ticket.revision
    || fingerprint(state, npc) !== ticket.fingerprint || npc.speechUntil <= state.elapsed
    || (npc.collision?.reactionUntil ?? 0) > state.elapsed) return state;
  if (ticket.threadId !== undefined && (!thread || thread.revision !== ticket.threadRevision
    || line?.speaker !== npc.id || line.text !== npc.speech)) return state;
  return { ...state, ...(thread ? { social: { ...state.social,
    threads: state.social.threads.map(item => item.id === thread.id ? { ...item,
      lines: item.lines.map(itemLine => itemLine.id === line!.id ? { ...itemLine, text, source } : itemLine),
    } : item) } } : {}), npcs: state.npcs.map(n => n.id === npc.id
    ? { ...n, speech: text, speechUntil: Math.max(n.speechUntil, state.elapsed + 3.5) } : n) };
}

const endpoint = (path: string) => `${import.meta.env.BASE_URL ?? '/'}npc-api/${path}`;
class DialogueRequestError extends Error {
  constructor(readonly status: number) { super(`台词服务 ${status}`); }
}
export const requestDialogue: DialogueTransport = async (payload, signal) => {
  const response = await fetch(endpoint('speech'), { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
  if (!response.ok) throw new DialogueRequestError(response.status);
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object') throw new Error('Invalid speech reply');
  const outcome = value as { requestId?: string; source?: string; outcome?: string };
  if (outcome.requestId === payload.requestId && outcome.source === 'template'
    && (outcome.outcome === 'busy' || outcome.outcome === 'skipped')) {
    throw new DialogueRequestError(outcome.outcome === 'busy' ? 503 : 422);
  }
  const reply = value as DialogueReply;
  if (reply.requestId !== payload.requestId || reply.source !== 'minimind3'
    || !validDialogueLine(reply.text) || !Number.isFinite(reply.latencyMs) || reply.latencyMs < 0) {
    throw new Error('Invalid speech reply');
  }
  return reply;
};

interface Options {
  read: () => GameState; publish: (state: GameState) => void;
  transport?: DialogueTransport; now?: () => number;
  onStatus?: (status: DialogueStatus) => void;
  onSpoken?: (npcId: NpcId, text: string) => void;
}
interface Job { ticket: DialogueTicket; refill: boolean; generation: number; retries?: number }
interface Pool { lines: string[]; until: number }

/** Owns only dialogue work. No timer or network result ever advances the simulation. */
export class DialogueDirector {
  private options: Options;
  private transport: DialogueTransport;
  private now: () => number;
  private generation = 0;
  private sequence = 0;
  private seen = new Map<NpcId, string>();
  private cooldown = new Map<NpcId, number>();
  private recent = new Map<NpcId, string[]>();
  private queue = new Map<NpcId, Job>();
  private pool = new Map<string, Pool>();
  private active: AbortController | null = null;
  private activeNpc: NpcId | null = null;
  private conversationThreadId: number | null = null;
  private probeController: AbortController | null = null;
  private retryAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private status: DialogueStatus = { mode: 'checking', enabled: true, generated: 0, cached: 0,
    discarded: 0, failures: 0, latencyMs: 0, poolSize: 0, lines: {} };

  constructor(options: Options) {
    this.options = options; this.transport = options.transport ?? requestDialogue;
    this.now = options.now ?? Date.now;
  }
  snapshot(): DialogueStatus { return { ...this.status, lines: { ...this.status.lines } }; }
  /** A paused conversation is authorized only while its panel remains open. */
  setConversationThread(threadId: number | null) {
    if (threadId === this.conversationThreadId) return;
    this.generation++; this.active?.abort(); this.active = null; this.activeNpc = null;
    this.cancelRetry();
    this.queue.clear();
    for (const thread of this.options.read().social.threads) {
      if (thread.id === threadId || thread.id === this.conversationThreadId) {
        thread.participants.forEach(id => this.seen.delete(id));
      }
    }
    this.conversationThreadId = threadId;
  }
  private cancelRetry() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private wakeAfterBackoff() {
    if (this.retryTimer !== null || !this.queue.size) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null; this.pump();
    }, Math.max(1, this.retryAt - this.now()));
  }
  private notify() {
    this.status.poolSize = [...this.pool.values()].reduce((sum, p) => sum + p.lines.length, 0);
    this.options.onStatus?.(this.snapshot());
  }
  setEnabled(enabled: boolean) {
    this.status.enabled = enabled;
    this.reset(); this.status.mode = enabled ? 'checking' : 'off'; this.notify();
    if (enabled) void this.probe();
  }
  async probe() {
    if (this.disposed || !this.status.enabled || this.probeController) return;
    const controller = new AbortController(); this.probeController = controller;
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch(endpoint('health'), { signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.ready !== true || body.model !== 'minimind-3-q8') throw new Error('Unavailable');
      if (!controller.signal.aborted) { this.status.mode = 'ready'; this.retryAt = 0; }
    } catch {
      if (!this.disposed && this.status.enabled && this.probeController === controller) {
        this.status.mode = 'fallback'; this.retryAt = this.now() + 10000;
      }
    } finally {
      clearTimeout(timer);
      if (this.probeController === controller) this.probeController = null;
      if (!this.disposed) this.notify();
    }
  }
  reset() {
    this.generation++; this.active?.abort(); this.active = null; this.activeNpc = null;
    this.probeController?.abort(); this.probeController = null;
    this.queue.clear(); this.pool.clear(); this.seen.clear(); this.cooldown.clear(); this.recent.clear();
    this.cancelRetry(); this.retryAt = 0;
    this.status.lines = {}; this.notify();
    this.conversationThreadId = null;
  }
  dispose() { this.disposed = true; this.reset(); }

  sync(state: GameState) {
    if (this.disposed || !this.status.enabled) return;
    if (state.status !== 'playing' && !(state.status === 'paused' && this.conversationThreadId !== null)) {
      if (this.active || this.queue.size) {
        this.generation++; this.active?.abort(); this.active = null; this.activeNpc = null; this.queue.clear();
        this.cancelRetry();
      }
      return;
    }
    for (const [key, p] of this.pool) if (p.until <= this.now()) this.pool.delete(key);
    for (const npc of state.npcs) {
      const rev = seenRevision(state, npc);
      if (this.seen.get(npc.id) === rev) continue;
      const ticket = createDialogueTicket(state, npc);
      if (state.status === 'paused' && ticket.threadId !== this.conversationThreadId) continue;
      this.seen.set(npc.id, rev);
      // Reopening a panel preserves an already generated transcript message.
      if (ticket.threadId !== undefined && socialBinding(state, npc)?.line.source !== 'template') continue;
      // An important new event cancels older text for this actor, including refills.
      if (this.activeNpc === npc.id) {
        this.generation++; this.active?.abort(); this.active = null; this.activeNpc = null;
      }
      this.queue.delete(npc.id);
      if (ticket.threadId !== undefined) this.cancelRetry();
      if (!npc.alive || !npc.speech || npc.speechUntil <= state.elapsed
        || (npc.collision?.reactionUntil ?? 0) > state.elapsed) continue;
      const cached = this.pool.get(ticket.key);
      const line = cached?.lines.shift();
      if (line && this.deliver(ticket, line, 'cache')) {
        this.queue.set(npc.id, { ticket, refill: true, generation: this.generation });
      } else if (ticket.threadId !== undefined || this.now() >= (this.cooldown.get(npc.id) ?? 0)) {
        this.queue.set(npc.id, { ticket, refill: false, generation: this.generation });
      }
    }
    this.pump();
  }

  private deliver(ticket: DialogueTicket, line: string, source: DialogueSource): boolean {
    if ((this.recent.get(ticket.npcId) ?? []).includes(line)) return false;
    const state = this.options.read();
    const next = applyDialogue(state, ticket, line, source, this.conversationThreadId);
    if (next === state) return false;
    // Consume our own write BEFORE React publishes it (no self-generation loop).
    this.seen.set(ticket.npcId, seenRevision(next, next.npcs.find(n => n.id === ticket.npcId)!));
    this.recent.set(ticket.npcId, [...(this.recent.get(ticket.npcId) ?? []), line].slice(-5));
    this.status.lines[ticket.npcId] = { text: line, source };
    if (source === 'cache') this.status.cached++; else this.status.generated++;
    this.options.publish(next);
    this.options.onSpoken?.(ticket.npcId, line);
    this.notify();
    return true;
  }

  private pump() {
    const current = this.options.read();
    if (this.active || this.disposed || !this.status.enabled
      || (current.status !== 'playing' && !(current.status === 'paused' && this.conversationThreadId !== null))) return;
    if (this.now() < this.retryAt) { this.wakeAfterBackoff(); return; }
    const selected = current.selectedNpc;
    const job = [...this.queue.values()].filter(item => current.status === 'playing'
      || item.ticket.threadId === this.conversationThreadId).sort((a, b) => Number(a.refill) - Number(b.refill)
      || Number(b.ticket.threadId !== undefined) - Number(a.ticket.threadId !== undefined)
      || Number(b.ticket.npcId === selected) - Number(a.ticket.npcId === selected))[0];
    if (!job) return;
    this.queue.delete(job.ticket.npcId);
    const { ticket } = job;
    // Refill uses the same semantic context; caption revisions themselves may differ.
    const state = this.options.read(), npc = state.npcs.find(n => n.id === ticket.npcId)!;
    if (!npc.alive || npc.speechUntil <= state.elapsed || (npc.collision?.reactionUntil ?? 0) > state.elapsed
      || fingerprint(state, npc) !== ticket.fingerprint
      || (!job.refill && revision(npc) !== ticket.revision)) { this.pump(); return; }
    const controller = new AbortController(); this.active = controller; this.activeNpc = ticket.npcId;
    const generation = this.generation;
    const timer = setTimeout(() => controller.abort(), 2800);
    const payload = { ...ticket.payload, requestId: `${generation}:${++this.sequence}:${ticket.npcId}`,
      recentLines: [...(this.recent.get(ticket.npcId) ?? [])] };
    this.cooldown.set(ticket.npcId, this.now() + 4000);
    void this.transport(payload, controller.signal).then(reply => {
      if (this.disposed || generation !== this.generation || controller.signal.aborted) return;
      if (reply.requestId !== payload.requestId || reply.source !== 'minimind3' || !Number.isFinite(reply.latencyMs)
        || !validDialogueLine(reply.text)
        || payload.recentLines.includes(reply.text)) throw new Error('Invalid or repeated caption');
      this.status.mode = 'ready'; this.status.latencyMs = reply.latencyMs;
      if (job.refill) {
        if (!this.pool.has(ticket.key) && this.pool.size >= 24) this.pool.delete(this.pool.keys().next().value!);
        const entry = this.pool.get(ticket.key) ?? { lines: [], until: this.now() + 30000 };
        if (!entry.lines.includes(reply.text) && entry.lines.length < 2) entry.lines.push(reply.text);
        this.pool.set(ticket.key, entry);
      } else if (this.deliver(ticket, reply.text, 'minimind3')) {
        // Social exchanges are specific to one message; never pre-generate another reply to it.
        if (ticket.threadId === undefined) this.queue.set(ticket.npcId, { ...job, refill: true });
      } else this.status.discarded++;
      this.notify();
    }).catch((error: unknown) => {
      if (this.disposed || generation !== this.generation) return;
      if (error instanceof DialogueRequestError && (error.status === 422 || error.status === 503)) {
        // A rejected sentence or busy slot is not a disconnected model service.
        this.status.discarded++; this.status.mode = 'ready';
        const retries = job.retries ?? 0;
        if (error.status === 503 && ticket.threadId !== undefined && retries < 2) {
          // Native ownership can outlive a cancelled browser request. Retry the
          // same social message twice, then retain its truthful template line.
          this.queue.set(ticket.npcId, { ...job, retries: retries + 1 });
        }
        this.retryAt = this.now() + 1000 * (retries + 1); this.notify(); return;
      }
      this.status.failures++; this.status.mode = 'fallback';
      this.retryAt = this.now() + 10000; this.queue.clear(); this.notify();
    }).finally(() => {
      clearTimeout(timer);
      if (this.active === controller) { this.active = null; this.activeNpc = null; this.pump(); }
    });
  }
}
