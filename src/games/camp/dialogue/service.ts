import type { GameState, NpcId } from '../simulation/types';
import { DialogueDirector as GenericDirector } from '../../../../packages/npc-dialogue/src/director';
import type { DialogueCandidate, DialogueStatus as GenericStatus, DialoguePayload, DialogueReply } from '../../../../packages/npc-dialogue/src/types';
import { minimindRuntime } from '../../../integrations/minimind/runtime';
import { DialogueRequestError } from '../../../integrations/minimind/protocol';
import { createDialogueTicket, fingerprint, revision, seenRevision, socialBinding } from './context';
import type { DialogueTicket } from './context';
import { applyDialogue, validDialogueLine } from './commit';
import { buildCaptionPrompt, cleanCaption } from './language';
export type { DialoguePayload, DialogueReply } from '../../../../packages/npc-dialogue/src/types';
export type DialogueSource = 'minimind3' | 'cache';
export interface DialogueStatus extends Omit<GenericStatus, 'lines'> {
  modelStage?: string; downloadProgress?: number; modelCached?: boolean; modelPersistent?: boolean; modelError?: string;
  lines: Partial<Record<NpcId, { text: string; source: DialogueSource }>>;
}
export type DialogueTransport = (payload: DialoguePayload, signal: AbortSignal) => Promise<DialogueReply>;
export const requestDialogue: DialogueTransport = (payload, signal) => minimindRuntime.generate({ ...payload, prompt: buildCaptionPrompt(payload) }, signal);
interface Options {
  read(): GameState; publish(state: GameState): void; transport?: DialogueTransport; now?: () => number;
  onStatus?(status: DialogueStatus): void; onSpoken?(npcId: NpcId, text: string): void;
}

/**
 * 营地世界与通用调度器之间的唯一桥梁。世界合法性、暂停面板权限、中文字幕校验
 * 均留在这里；时间调度与 AbortController 是宿主能力，不渗入纯 TypeScript 包。
 */
export class DialogueDirector {
  private core: GenericDirector<DialogueTicket>;
  private conversationThreadId: number | null = null;
  private disposed = false;
  private probeGeneration = 0;
  private preparing = false;
  private modelReady = false;
  private unsubscribeModel?: () => void;
  private model: Pick<DialogueStatus, 'modelStage' | 'downloadProgress' | 'modelCached' | 'modelPersistent' | 'modelError'> = {};
  constructor(private options: Options) {
    this.core = new GenericDirector({
      clock: { now: options.now ?? Date.now, schedule: (callback, ms) => {
        const timer = setTimeout(callback, ms); return () => clearTimeout(timer);
      }, cancellation: () => { const controller = new AbortController(); return { signal: controller.signal, cancel: () => controller.abort() }; } },
      bridge: {
        canRun: () => this.canRun(), collect: () => this.collect(),
        isCurrent: (ticket, refill) => this.isCurrent(ticket, refill),
        commit: (ticket, text, source) => {
          // 不在读取和发布之间 await；任何后台生成都无权推进模拟或改变命令。
          const state = options.read();
          const next = applyDialogue(state, ticket, text, source === 'cache' ? 'cache' : 'minimind3', this.conversationThreadId);
          if (next === state) return false;
          const rev = seenRevision(next, next.npcs.find(npc => npc.id === ticket.npcId)!);
          options.publish(next); options.onSpoken?.(ticket.npcId, text); return rev;
        },
      },
      transport: async (payload, signal) => {
        const reply = await (options.transport ?? requestDialogue)(payload, signal as AbortSignal);
        if (reply.source !== 'minimind3') throw new Error('Invalid camp dialogue source');
        return reply;
      },
      validate: (text, payload) => validDialogueLine(text) && cleanCaption(text, payload) === text,
      classifyError: error => error instanceof DialogueRequestError ? error.outcome : undefined,
      onStatus: () => this.notify(),
    });
    if (!options.transport) this.unsubscribeModel = minimindRuntime.subscribe(value => {
      if (this.disposed) return;
      this.modelReady = value.stage === 'ready';
      this.model = { modelStage: value.stage, downloadProgress: value.progress, modelCached: value.cached,
        modelPersistent: value.persistent, modelError: value.error };
      if (this.core.snapshot().enabled) this.core.setMode(value.stage === 'ready' ? 'ready' : value.stage === 'error' ? 'fallback' : 'checking');
      if (this.modelReady) { this.core.clearSeen(); queueMicrotask(() => this.sync(options.read())); }
    });
  }
  private notify() { if (!this.disposed) this.options.onStatus?.(this.snapshot()); }
  snapshot(): DialogueStatus { return { ...this.core.snapshot(), ...this.model } as DialogueStatus; }
  private canRun() {
    const state = this.options.read();
    return Boolean((this.options.transport || this.modelReady)
      && (state.status === 'playing' || state.status === 'paused' && this.conversationThreadId !== null));
  }
  private collect(): DialogueCandidate<DialogueTicket>[] {
    const state = this.options.read();
    return state.npcs.map(npc => {
      const ticket = createDialogueTicket(state, npc);
      const permitted = state.status !== 'paused' || ticket.threadId === this.conversationThreadId;
      return { actorId: npc.id, revision: seenRevision(state, npc), key: ticket.key, ticket, payload: ticket.payload,
        eligible: permitted && npc.alive && Boolean(npc.speech) && npc.speechUntil > state.elapsed
          && (npc.collision?.reactionUntil ?? 0) <= state.elapsed
          && (ticket.threadId === undefined || socialBinding(state, npc)?.line.source === 'template'),
        priority: (ticket.threadId === undefined ? 0 : 10) + Number(npc.id === state.selectedNpc),
        urgent: ticket.threadId !== undefined, allowRefill: ticket.threadId === undefined };
    });
  }
  private isCurrent(ticket: DialogueTicket, refill: boolean) {
    const state = this.options.read(), npc = state.npcs.find(person => person.id === ticket.npcId);
    return Boolean(this.canRun() && npc?.alive && npc.speechUntil > state.elapsed
      && (npc.collision?.reactionUntil ?? 0) <= state.elapsed
      && fingerprint(state, npc) === ticket.fingerprint && (refill || revision(npc) === ticket.revision)
      && (state.status !== 'paused' || ticket.threadId === this.conversationThreadId));
  }
  setConversationThread(threadId: number | null) {
    if (threadId === this.conversationThreadId) return;
    this.core.invalidateScope(); this.conversationThreadId = threadId;
  }
  setEnabled(enabled: boolean) { this.core.setEnabled(enabled); this.probeGeneration++; this.preparing = false; if (enabled) void this.probe(); }
  async probe() {
    if (this.disposed || !this.core.snapshot().enabled || this.preparing) return;
    this.preparing = true; const generation = this.probeGeneration;
    try {
      await minimindRuntime.prepare();
      if (!this.disposed && generation === this.probeGeneration && this.core.snapshot().enabled) {
        this.modelReady = true;
        // 并发生成若已失败，不让较晚的探测成功冲掉错误状态。
        if (this.core.snapshot().mode !== 'fallback') this.core.setMode('ready');
        this.sync(this.options.read());
      }
    } catch {
      if (!this.disposed && generation === this.probeGeneration && this.core.snapshot().enabled) this.core.setMode('fallback');
    } finally { if (generation === this.probeGeneration) this.preparing = false; }
  }
  reset() { this.probeGeneration++; this.preparing = false; this.conversationThreadId = null; this.core.reset(); }
  dispose() { this.disposed = true; this.unsubscribeModel?.(); this.probeGeneration++; this.core.dispose(); }
  sync(_state: GameState) { if (!this.disposed) this.core.sync(); }
}
