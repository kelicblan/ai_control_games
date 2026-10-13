/** 与世界实现无关的对话输入。ID 与动作都是宿主的不透明字符串。 */
export interface DialoguePayload {
  requestId: string; npcId: string; name: string; persona: string;
  action: string; emotion: string; event: string;
  /** 经过宿主确认的事实；不能把角色的自我辩解放入此数组。 */
  facts: string[]; memories: string[]; recentLines: string[];
  socialContext?: string[]; playerText?: string;
  /** 双方最近的对话，与仅用于防止重复的 recentLines 分开。 */
  conversation?: { speaker: string; text: string }[];
  privateIntent?: string;
  publicExpression?: { kind: string; tone: string; reason: string; allowDeception: boolean };
  /** 由游戏语言适配器构建；模型集成不需要导入具体游戏。 */
  prompt?: string;
}
export interface DialogueReply { requestId: string; text: string; source: string; latencyMs: number }
export type DialogueSource = string;
/** 最小取消契约；无需依赖浏览器 AbortSignal，宿主负责桥接。 */
export interface CancellationSignal { readonly aborted: boolean }
export interface Cancellation { signal: CancellationSignal; cancel(): void }
/** 真实时间与调度均由宿主注入；定时回调绝不能推进游戏模拟时钟。 */
export interface DialogueClock {
  now(): number;
  schedule(callback: () => void, milliseconds: number): () => void;
  cancellation(): Cancellation;
}
export type DialogueTransport = (payload: DialoguePayload, signal: CancellationSignal) => Promise<DialogueReply>;
export interface DialogueCandidate<TTicket> {
  actorId: string; revision: string; key: string; ticket: TTicket; payload: DialoguePayload;
  eligible: boolean; priority: number; urgent: boolean; allowRefill: boolean;
}
export interface DialogueBridge<TTicket> {
  canRun(): boolean;
  collect(): readonly DialogueCandidate<TTicket>[];
  /** refill=true 时可忽略已被本系统改写的字幕，但仍须验证意图和世界状态。 */
  isCurrent(ticket: TTicket, refill: boolean): boolean;
  /** 必须同步重新读取并校验状态；成功返回写入后的语义/字幕修订。 */
  commit(ticket: TTicket, text: string, source: DialogueSource): string | false;
}
export interface DialogueStatus {
  mode: 'checking' | 'ready' | 'fallback' | 'off'; enabled: boolean;
  generated: number; cached: number; discarded: number; failures: number; latencyMs: number; poolSize: number;
  lines: Record<string, { text: string; source: DialogueSource }>;
}
export interface DialogueOptions<TTicket> {
  bridge: DialogueBridge<TTicket>; clock: DialogueClock; transport: DialogueTransport;
  validate(text: string, payload: DialoguePayload): boolean;
  onStatus?(status: DialogueStatus): void;
  /** 本地推理忙/主动跳过不等同于故障；分类逻辑由后端适配提供。 */
  classifyError?(error: unknown): 'busy' | 'skipped' | undefined;
}
