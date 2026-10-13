/**
 * 跨游戏 NPC 心智契约。
 * 所有强度使用 0..1；所有时间使用宿主注入的模拟秒。核心既不认识地图、
 * 物资和人物名单，也不拥有世界对象。宿主持有 MindState 的可修改副本。
 */
export interface PersonalityTraits {
  /** 勤奋：承担高付出任务的内在意愿。 */
  diligence: number;
  /** 共情：他人的困难和集体收益对自己的吸引力。 */
  empathy: number;
  /** 诚实：低值允许用表面配合掩饰自己的回避动机。 */
  honesty: number;
  /** 自利：个人收益、保留精力在取舍中的权重。 */
  selfInterest: number;
  /** 冲动：遭受否决后怒气增长与直接反对的倾向。 */
  impulsivity: number;
  /** 自主：对外部命令和催促的抵触程度。 */
  autonomy: number;
  /** 耐心：承受不满、等待调整，以及怒气平息的倾向。 */
  patience: number;
  /** 公平敏感：分配失衡与失约带来的长期不满。 */
  fairness: number;
  /** 胆量：承担风险与公开发起集体异议的倾向。 */
  courage: number;
}

export interface NpcProfile { id: string; traits: PersonalityTraits }
export type ConcernKind = 'rest' | 'food' | 'fairness' | 'safety';
export type BehaviorIntent = 'cooperate' | 'endure' | 'bargain' | 'evade' | 'rest' | 'refuse' | 'recruit' | 'strike';
export type ExpressionKind = 'explanation' | 'request' | 'bargain' | 'complaint' | 'refusal' | 'conceal' | 'recruit';
export type ExpressionTone = 'neutral' | 'warm' | 'tired' | 'irritated' | 'angry' | 'guarded';

/** 一轮尚未真正解决的诉求；获准只是 granted，实际恢复才变为 resolved。 */
export interface MindConcern {
  /** 宿主可据此识别同一轮诉求，不能在对话冷却后重新创建。 */
  id: number;
  kind: ConcernKind;
  status: 'open' | 'granted' | 'resolved';
  openedAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  denials: number;
  /** 当前需要的强度；0 表示没有压力，1 表示最迫切。 */
  severity: number;
}

export interface MindMemory {
  sequence: number;
  at: number;
  type: MindEventType;
  actorId?: string;
  concern?: ConcernKind;
  /** 亲历或宿主证实的事件摘要；角色的公开谎言不能当成已完成事实写入。 */
  fact: string;
  salience: number;
}

export interface IntentState {
  kind: BehaviorIntent;
  since: number;
  /** 最短维持截止时间。身体危急、合法候选消失或需求已恢复可提前终止。 */
  until: number;
  actionId: string | null;
  reason: string;
}

/** 公开说明、抱怨和掩饰的表达计划。reason 是私人依据，不应原样冒充公共事实。 */
export interface ExpressionPlan {
  kind: ExpressionKind;
  tone: ExpressionTone;
  concern?: ConcernKind;
  reason: string;
  /** 只许可表达层有意掩饰本人的动机；绝不许可增加库存或伪造动作完成。 */
  allowDeception: boolean;
  revision: number;
}

export interface MindState {
  version: 1;
  npcId: string;
  revision: number;
  updatedAt: number;
  /** 独立于记忆数组的事件最高序号；裁剪记忆后仍能阻止重复计入。 */
  lastEventSequence: number;
  /**
   * 持久的和解阶段，独立于台词、线程和会被裁剪的记忆。
   * grievanceRevision 是最近一次真实负面事件的序号；apologyRevision 是已经
   * 接受道歉的冲突阶段，满足 0 <= apologyRevision <= grievanceRevision <= lastEventSequence。
   * 字段可缺省以兼容早期 v1；缺省时不从残余历史推测奖励，只等待新的负面事件。
   */
  reconciliation?: { grievanceRevision: number; apologyRevision: number };
  nextConcernId: number;
  randomState: number;
  emotions: { anger: number; resentment: number; stress: number };
  concerns: MindConcern[];
  memories: MindMemory[];
  intent: IntentState;
  expression: ExpressionPlan;
  /** 当前有效工作投入。宿主决定如何映射到进度，核心不能直接减少/增加资源。 */
  effort: number;
}

export type MindEventType = 'request_denied' | 'request_granted' | 'promise_broken' | 'promise_kept' | 'praised' | 'urged' | 'deception_exposed' | 'work_completed' | 'help_received' | 'peer_protest' | 'apologized';
export interface MindEvent {
  /** 同一个心智接收的序号严格递增，重复或倒序输入不会再次修改状态。 */
  sequence: number;
  at: number;
  type: MindEventType;
  actorId?: string;
  concern?: ConcernKind;
  magnitude?: number;
  fact: string;
}

export interface AppraisalDelta {
  applied: boolean;
  /** 归一化增量，宿主对自己的信任/士气值应用一次；例如百分制需乘 100。 */
  trustDelta: number;
  moraleDelta: number;
}

/** 只能提供人物实际知道的同伴状态；全知世界不能直接灌入核心。 */
export interface PeerObservation {
  id: string;
  affinity: number;
  anger: number;
  resentment: number;
  protesting: boolean;
  observedAt: number;
}
export interface MindObservation {
  /** 模拟秒，可暂停；核心不会读取系统时间。 */
  now: number;
  /** 值越大代表需要越迫切，不是剩余体力；所有分量均为 0..1。 */
  needs: { fatigue: number; hunger: number; pain: number; exposure: number };
  /** 宿主把累计工作负担归一化后输入，可通过真实休息降低。 */
  workload: number;
  /** 人物可知的分工失衡程度；不是全世界的客观道德判决。 */
  unfairness: number;
  /** 宿主拥有的权威信任值；不得与心智另存一份后互相覆盖。 */
  trustInAuthority: number;
  commandActionId?: string;
  peers: readonly PeerObservation[];
}

export type ActionKind = 'work' | 'rest' | 'eat' | 'shelter' | 'aid' | 'idle' | 'explore';
/** 已被宿主筛成合法的行动；id 可以是任何游戏的字符串，不限定为通用 kind。 */
export interface ActionOffer {
  id: string;
  kind: ActionKind;
  /** 执行成本、风险、自身收益与集体收益，全部由游戏适配归一化。 */
  effort: number;
  risk: number;
  selfBenefit: number;
  groupBenefit: number;
  /** 基础策略/模型的归一化偏好；心智不会因该值绕过拒工和身体保护。 */
  baseline?: number;
}
export interface BehaviorDecision {
  /** 无候选时为 null；宿主应保留安全待机，不能猜出一个不合法动作。 */
  actionId: string | null;
  intent: BehaviorIntent;
  expression: ExpressionPlan;
  reason: string;
  effort: number;
}
