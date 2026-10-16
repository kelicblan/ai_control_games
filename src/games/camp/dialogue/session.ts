import type { GameState, NpcId } from '../simulation/types';
import type { DialoguePayload, DialogueReply } from '../../../../packages/npc-dialogue/src/types';
import { modelManager, modelName, prepareModels } from '../../../integrations/models/runtime';
import { createDialogueTicket } from './context';
import { buildCaptionPrompt, buildFallbackPrompt,cleanCaption } from './language';
import { validDialogueLine } from './commit';
import { socialDialogueId, type DialogueRecord } from './records';
import type { DialogueStatus } from './service';
import { socialLineTargets } from '../simulation/social-types';

/** The sole production reply API. No GameState writes, template fallback or display lifetime. */
export async function generateDialogue(payload: DialoguePayload, signal: AbortSignal): Promise<DialogueReply> {
  const fallbackPrompt = buildFallbackPrompt(payload);
  return modelManager.generate({ ...payload, prompt: buildCaptionPrompt(payload), fallbackPrompt, fallbackSelection: undefined }, signal,
    reply => reply.requestId === payload.requestId && Number.isFinite(reply.latencyMs)
      && validDialogueLine(reply.text) && cleanCaption(reply.text, payload) === reply.text);
}

interface Input { id: string; npcId: NpcId; at: number; payload: DialoguePayload; threadId?: number; lineId?: number; targetIds?: (NpcId|'player')[]; prerequisiteId?:string; attempts?: number; result?: DialogueRecord }
interface Options {
  serverManaged?():boolean;
  read(): GameState;
  scope(): string | undefined;
  records(): readonly DialogueRecord[];
  persist(scope: string, result: DialogueRecord): Promise<DialogueRecord>;
  transport?(payload: DialoguePayload, signal: AbortSignal): Promise<DialogueReply>;
  onStatus?(status: DialogueStatus): void;
  onPending?(input: Input, error?: string): void;
  onSpoken?(npcId: NpcId, text: string): void;
}

/** Requests snapshot their input once. World ticks cannot abort or rewrite their results. */
export class DialogueSession {
  private scopeValue?: string;
  private queue = new Map<string, Input>();
  private seen = new Set<string>();
  private active?: { controller: AbortController; input: Input };
  private disposed = false;
  private threadId: number | null = null;
  private unsubscribe?: () => void;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private status: DialogueStatus = { mode: 'checking', enabled: true, generated: 0, cached: 0,
    discarded: 0, failures: 0, latencyMs: 0, poolSize: 0, lines: {} };
  constructor(private options: Options) {
    if (!options.transport) this.unsubscribe = modelManager.subscribe(state => {
      const id = state.activeId ?? state.selectedId;
      this.status = { ...this.status, modelStage: state.stage, modelId: id, modelName: modelName(id),
        modelBackend: id === 'minimind3' ? 'wasm' : id.startsWith('remote-') ? 'remote' : 'native',
        downloadProgress: state.progress, modelCached: state.cached, modelPersistent: state.persistent,
        modelError: state.error, modelRetryStopped: state.retryStopped, modelAutoRetries: state.autoRetries,
        mode: !this.status.enabled ? 'off' : state.stage === 'ready' ? 'ready' : state.stage === 'error' ? 'fallback' : 'checking' };
      this.notify(); queueMicrotask(() => this.sync());
    });
  }
  snapshot(): DialogueStatus { return { ...this.status, lines: { ...this.status.lines } }; }
  private notify() { if (!this.disposed) this.options.onStatus?.(this.snapshot()); }
  setConversationThread(id: number | null) { this.threadId = id; this.sync(); }
  setEnabled(enabled: boolean) { this.status.enabled = enabled; if (!enabled) this.reset(); this.status.mode = enabled ? 'checking' : 'off'; this.notify(); if (enabled) void this.probe(); }
  async probe(automatic = false) {
    if (this.disposed || !this.status.enabled) return;
    try { if (automatic) await modelManager.retryAutomatically(); else await prepareModels(modelManager.snapshot().stage === 'error'); }
    catch (error) { this.status.modelError = error instanceof Error ? error.message : String(error); this.notify(); }
    this.sync();
  }
  reset(clearStatistics = false) {
    this.active?.controller.abort(); this.active = undefined;
    clearTimeout(this.retryTimer); this.retryTimer = undefined; this.queue.clear(); this.seen.clear(); this.scopeValue = undefined;
    if (clearStatistics) { this.status.generated = 0; this.status.failures = 0; this.status.discarded = 0; }
    this.status.lines = {};
  }
  dispose() { this.disposed = true; this.unsubscribe?.(); this.reset(); }
  sync(_state?: GameState) {
    if(this.options.serverManaged?.())return;
    if (this.disposed || !this.status.enabled) return;
    const scope = this.options.scope(); if (!scope) return;
    if (scope !== this.scopeValue) { this.reset(); this.scopeValue = scope; }
    const state = this.options.read();
    if (!['playing', 'paused'].includes(state.status)) return;
    for (const record of this.options.records()) { this.seen.add(record.id); this.queue.delete(record.id); }
    const add = (input: Input) => {
      if (this.seen.has(input.id)) return;
      this.seen.add(input.id);
      // Coalesce only unstarted ambient observations. Explicit chat is never replaced.
      if (input.threadId === undefined) for (const [id, old] of this.queue)
        if (old.npcId === input.npcId && old.threadId === undefined && !old.attempts && !old.result) this.queue.delete(id);
      this.queue.set(input.id, input);
    };
    for (const thread of state.social.threads) {
      if (state.status === 'paused' && thread.id !== this.threadId) continue;
      for (const line of thread.lines) {
        if (line.speaker === 'player' || line.source !== 'template') continue;
        // Old transcripts are history, not a backlog to regenerate after opening the game.
        if (line.at < state.elapsed - 60 && thread.id !== this.threadId) continue;
        const npc = state.npcs.find(n => n.id === line.speaker); if (!npc?.alive) continue;
        const inputState = { ...state, social: { ...state.social, threads: [{ ...thread, lines: thread.lines.filter(item => item.id <= line.id) }] } };
        const payload = createDialogueTicket(inputState, { ...npc, speech: line.text }).payload;
        const targets=socialLineTargets(thread,line);
        const prior=[...thread.lines].reverse().find(item=>item.id<line.id&&targets.includes(item.speaker));
        const prerequisiteId=prior&&prior.speaker!=='player'?socialDialogueId(thread.id,prior.id):undefined;
        const act=line.act??(line.text.includes('你愿意一起谈吗')?'invite':line.text.includes('这次我愿意一起谈')?'accept-invitation':/我先不加入|先劝双方/.test(line.text)?'decline-invitation':undefined);
        payload.replyContext={targetNames:targets.map(id=>id==='player'?'领主':state.npcs.find(n=>n.id===id)?.name??id),act,
          ...(prior?.speaker==='player'?{trigger:{id:socialDialogueId(thread.id,prior.id),speakerId:'player',speaker:'领主',text:prior.text}}:{})};
        if(!targets.includes('player'))payload.playerText=undefined;
        payload.conversation = thread.lines.filter(item => item.id < line.id).flatMap(item=>{
          const record=this.options.records().find(record=>record.id===socialDialogueId(thread.id,item.id));
          return item.speaker==='player'?[{speaker:'玩家',text:item.text}]:record?[{speaker:state.npcs.find(n=>n.id===item.speaker)?.name??item.speaker,text:record.text}]:[];
        }).slice(-6);
        add({ id: socialDialogueId(thread.id, line.id), npcId: npc.id, at: line.at, payload, threadId: thread.id, lineId: line.id,targetIds:targets,prerequisiteId });
      }
    }
    if (state.status === 'playing') for (const npc of state.npcs) {
      if (!npc.alive || !npc.speech || npc.speechUntil <= state.elapsed) continue;
      if (state.social.threads.some(thread => thread.lines.some(line => line.speaker === npc.id && line.text === npc.speech))) continue;
      if (npc.speechOrigin?.text === npc.speech && npc.speechOrigin.until === npc.speechUntil) continue;
      const id = `ambient:${npc.id}:${npc.speechUntil}:${npc.speech}`;
      add({ id, npcId: npc.id, at: state.elapsed, payload: createDialogueTicket(state, npc).payload });
    }
    while (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
    void this.pump();
  }
  private async pump() {
    if (this.active || this.disposed || !this.status.enabled || this.retryTimer) return;
    if (!this.options.transport && modelManager.snapshot().stage !== 'ready') return;
    const input = [...this.queue.values()].filter(input=>!input.prerequisiteId||this.options.records().some(r=>r.id===input.prerequisiteId)).sort((a,b) => Number(b.threadId !== undefined) - Number(a.threadId !== undefined) || a.at - b.at)[0];
    if (!input || !this.scopeValue) return;
    this.queue.delete(input.id);
    const scope = this.scopeValue, controller = new AbortController(), active = { controller, input };
    this.active = active; this.options.onPending?.(input);
    const payload = { ...input.payload, requestId: input.id };
    if(input.prerequisiteId){
      const parent=this.options.records().find(r=>r.id===input.prerequisiteId)!;
      payload.replyContext={...payload.replyContext!,trigger:{id:parent.id,speakerId:parent.npcId,speaker:this.options.read().npcs.find(n=>n.id===parent.npcId)?.name??parent.npcId,text:parent.text}};
    }
    if (input.threadId !== undefined) {
      const thread = this.options.read().social.threads.find(item => item.id === input.threadId);
      if (thread) payload.conversation = thread.lines.filter(item => item.id < input.lineId!).flatMap(line=>{
        const record=this.options.records().find(r=>r.id===socialDialogueId(thread.id,line.id));
        return line.speaker==='player'?[{speaker:'玩家',text:line.text}]:record?[{speaker:this.options.read().npcs.find(n=>n.id===line.speaker)?.name??line.speaker,text:record.text}]:[];
      }).slice(-6);
    }
    try {
      const reply = input.result ? { ...input.result, requestId: input.id }
        : await (this.options.transport ?? generateDialogue)(payload, AbortSignal.any([controller.signal, AbortSignal.timeout(70000)]));
      if (controller.signal.aborted || this.disposed || this.scopeValue !== scope) return;
      if (reply.requestId !== input.id || !validDialogueLine(reply.text) || cleanCaption(reply.text, payload) !== reply.text)
        throw new Error('模型没有返回有效对话');
      const result: DialogueRecord = { id: input.id, npcId: input.npcId, at: input.at, text: reply.text,
        source: reply.source, latencyMs: reply.latencyMs, threadId: input.threadId, lineId: input.lineId,...(input.targetIds?{targetIds:input.targetIds}:{}),...(input.prerequisiteId?{replyToId:input.prerequisiteId}:{}) };
      // A result is spoken only after the database acknowledges this exact record.
      input.result = result;
      const saved = await this.options.persist(scope, result);
      if (controller.signal.aborted || this.disposed || this.scopeValue !== scope) return;
      this.status.generated++; this.status.mode = 'ready'; this.status.latencyMs = reply.latencyMs;
      this.status.lines[input.npcId] = { text: saved.text, source: saved.source as 'minimind3' };
      this.options.onSpoken?.(input.npcId, saved.text); this.notify();
    } catch (error) {
      if (controller.signal.aborted || this.disposed || this.scopeValue !== scope) return;
      this.status.failures++; this.status.mode = 'fallback';
      const message = error instanceof Error ? error.message : String(error);
      // Keep a failed explicit turn retryable; never silently substitute authored text.
      input.attempts = (input.attempts ?? 0) + 1;
      this.options.onPending?.(input, `${message}；${input.attempts <= 2 ? `稍后自动重试 ${input.attempts}/2` : '已停止自动重试'}`); this.notify();
      if (input.attempts <= 2) {
        this.queue.set(input.id, input);
        this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.pump(); }, 10000);
      }
    } finally { if (this.active === active) { this.active = undefined; void this.pump(); } }
  }
}
