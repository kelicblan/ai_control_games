import type { SocialState, SocialTopic } from './social-types';
import type { NpcSettings } from '../../../../packages/npc-settings/src';
import type { CampInitialSettings } from '../settings/runtime';
import type { MindState } from '../../../../packages/npc-core/src';
export const ACTIONS = ['wood', 'food', 'fire', 'eat', 'rest', 'help', 'camp', 'explore'] as const;
export type ActionId = typeof ACTIONS[number];
export const EMOTIONS = ['calm', 'happy', 'worried', 'annoyed', 'caring'] as const;
export type Emotion = typeof EMOTIONS[number];
export const NPC_IDS = ['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye'] as const;
export type NpcId = typeof NPC_IDS[number];
export type PolicyMode = 'model' | 'rules';
export type GameStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type Difficulty = 'cozy' | 'normal' | 'hard';
export type Weather = 'clear' | 'rain' | 'wind' | 'storm';
export type ScenarioId = 'standard' | 'storm' | 'conflict';
export interface Point { x: number; y: number }
export interface Atmosphere {
  windStrength: number; windAngle: number; rainIntensity: number; cloudCover: number; stormRisk: number;
  lightningAt: number; lightningPoint: Point | null; nextLightningAt: number; revision: number;
}
/** Raw simulation context. Only the model's feature vector normalizes these values. */
export interface WeatherSnapshot {
  kind: Weather; windStrength: number; rainIntensity: number; stormRisk: number;
  wetness: number; exposure: number; shelterIntegrity: number; shelterDistance: number;
}
export type DecisionTrigger = 'routine' | 'weather' | 'thunder' | 'needs' | 'command' | 'social';
export interface ObservationContext {
  weather: WeatherSnapshot;
  self: { position: Point; health: number; energy: number; hunger: number; fear: number };
  resources: { wood: number; food: number; fire: number };
  allies: { id: NpcId; position: Point; health: number; action: ActionId | null }[];
}
export interface Personality { bravery: number; diligence: number; empathy: number }
export type ReactionKind = 'burn' | 'thorns' | 'impact' | 'water' | 'bump';
export interface ContactReaction {
  kind: ReactionKind; objectId: string; intensity: number; utterance: string;
}
export interface CollisionState {
  hurtUntil: number; reactionUntil: number;
  objectCooldowns: Record<string, number>;
  lastHit?: { kind: ReactionKind; objectId: string; time: number; intensity: number; damage: number };
}
export interface Npc {
  id: NpcId; name: string; role: string; color: string;
  personality: Personality;
  /** 本局初始模板快照。保存设置不会修改它，只有新开局使用最新模板。 */
  initialSettings?: CampInitialSettings;
  /** 通用、可序列化心智；旧 v1 存档迁移前允许缺省。 */
  mind?: MindState;
  /** 当前行动真实投入，0.1..1；仅由心智裁决更新，减少工作进度而非伪造结果。 */
  actionEffort?: number;
  health: number; energy: number; hunger: number; morale: number; trust: number; fear: number; wetness: number;
  position: Point; destination: Point;
  action: ActionId | null; command: ActionId | null;
  progress: number; actionDuration: number; decisionIn: number;
  emotion: Emotion; speech: string; speechUntil: number;
  injured: boolean; alive: boolean;
  inventory: { wood: number; food: number };
  completedTasks: number; refusals: number;
  lastInteraction: number;
  /** Temporary player movement. Missing in older v1 saves. */
  manualTarget?: Point;
  collision?: CollisionState;
  /** A pending re-evaluation preserves a valid task until the policy actually chooses. */
  decisionTrigger?: DecisionTrigger;
  previousAction?: ActionId | null;
}
export interface GameEvent { id: number; time: number; kind: 'info' | 'good' | 'warning' | 'danger'; text: string; npcId?: NpcId; reaction?: ContactReaction }
export interface DecisionRecord {
  id: number; time: number; npcId: NpcId;
  source: 'model' | 'rules' | 'fallback';
  action: ActionId; emotion: Emotion;
  scores: number[]; features: number[]; allowed: ActionId[];
  latencyMs: number; accepted: boolean; reason?: string;
  featureVersion?: 1 | 2; trigger?: DecisionTrigger; previousAction?: ActionId | null; weather?: WeatherSnapshot;
}
export interface GameState {
  version: 1; seed: number; randomState: number;
  status: GameStatus; difficulty: Difficulty; scenario: ScenarioId; mode: PolicyMode;
  elapsed: number; duration: number; day: number;
  wood: number; food: number; fire: number;
  weather: Weather; danger: number; weatherUntil: number;
  atmosphere: Atmosphere; shelterIntegrity: number;
  npcs: Npc[]; events: GameEvent[]; decisions: DecisionRecord[];
  social: SocialState;
  selectedNpc: NpcId; priority: 'balanced' | 'wood' | 'food';
  nextEventId: number; nextDecisionId: number; nextWorldEvent: number;
  stats: { gatheredWood: number; gatheredFood: number; meals: number; helps: number; modelDecisions: number; ruleDecisions: number; fallbackDecisions: number; totalLatency: number; taskSwitches: number };
  resultReason: string; score: number;
}
export interface PolicyObservation { features: number[]; allowed: ActionId[]; npcId: NpcId; context?: ObservationContext }
export interface PolicyResult { action: ActionId; emotion: Emotion; scores: number[]; source: 'model' | 'rules' | 'fallback'; latencyMs: number; reason?: string }
export type PolicyFunction = (observation: PolicyObservation) => PolicyResult;
export interface GameOptions { seed?: number; mode?: PolicyMode; difficulty?: Difficulty; scenario?: ScenarioId; npcSettings?: NpcSettings }
export interface GameCommand { type: 'assign' | 'praise' | 'urge' | 'feed' | 'priority' | 'select' | 'recall' | 'move' | 'weather' | 'social-open' | 'social-reply' | 'social-chat'; npcId?: NpcId; action?: ActionId | null; priority?: GameState['priority']; target?: Point; weather?: Weather; topic?: SocialTopic; threadId?: number; choiceId?: string; text?: string }
