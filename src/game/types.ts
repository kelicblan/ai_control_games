export const ACTIONS = ['wood', 'food', 'fire', 'eat', 'rest', 'help', 'camp', 'explore'] as const;
export type ActionId = typeof ACTIONS[number];
export const EMOTIONS = ['calm', 'happy', 'worried', 'annoyed', 'caring'] as const;
export type Emotion = typeof EMOTIONS[number];
export type NpcId = 'azhuang' | 'xiaomi' | 'laozhou';
export type PolicyMode = 'model' | 'rules';
export type GameStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type Difficulty = 'cozy' | 'normal' | 'hard';
export type Weather = 'clear' | 'rain' | 'wind';
export type ScenarioId = 'standard' | 'storm' | 'conflict';
export interface Point { x: number; y: number }
export interface Personality { bravery: number; diligence: number; empathy: number }
export interface Npc {
  id: NpcId; name: string; role: string; color: string;
  personality: Personality;
  health: number; energy: number; hunger: number; morale: number; trust: number; fear: number;
  position: Point; destination: Point;
  action: ActionId | null; command: ActionId | null;
  progress: number; actionDuration: number; decisionIn: number;
  emotion: Emotion; speech: string; speechUntil: number;
  injured: boolean; alive: boolean;
  inventory: { wood: number; food: number };
  completedTasks: number; refusals: number;
  lastInteraction: number;
}
export interface GameEvent { id: number; time: number; kind: 'info' | 'good' | 'warning' | 'danger'; text: string; npcId?: NpcId }
export interface DecisionRecord {
  id: number; time: number; npcId: NpcId;
  source: 'model' | 'rules' | 'fallback';
  action: ActionId; emotion: Emotion;
  scores: number[]; features: number[]; allowed: ActionId[];
  latencyMs: number; accepted: boolean; reason?: string;
}
export interface GameState {
  version: 1; seed: number; randomState: number;
  status: GameStatus; difficulty: Difficulty; scenario: ScenarioId; mode: PolicyMode;
  elapsed: number; duration: number; day: number;
  wood: number; food: number; fire: number;
  weather: Weather; danger: number; weatherUntil: number;
  npcs: Npc[]; events: GameEvent[]; decisions: DecisionRecord[];
  selectedNpc: NpcId; priority: 'balanced' | 'wood' | 'food';
  nextEventId: number; nextDecisionId: number; nextWorldEvent: number;
  stats: { gatheredWood: number; gatheredFood: number; meals: number; helps: number; modelDecisions: number; ruleDecisions: number; fallbackDecisions: number; totalLatency: number; taskSwitches: number };
  resultReason: string; score: number;
}
export interface PolicyObservation { features: number[]; allowed: ActionId[]; npcId: NpcId }
export interface PolicyResult { action: ActionId; emotion: Emotion; scores: number[]; source: 'model' | 'rules' | 'fallback'; latencyMs: number; reason?: string }
export type PolicyFunction = (observation: PolicyObservation) => PolicyResult;
export interface GameOptions { seed?: number; mode?: PolicyMode; difficulty?: Difficulty; scenario?: ScenarioId }
export interface GameCommand { type: 'assign' | 'praise' | 'urge' | 'feed' | 'priority' | 'select' | 'recall'; npcId?: NpcId; action?: ActionId | null; priority?: GameState['priority'] }
