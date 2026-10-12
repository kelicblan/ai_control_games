import type { ActionId, Difficulty, Emotion, Npc, NpcId, Point, ScenarioId } from './types';

export const GAME_DURATION = 240;
export const MAX_EVENTS = 80;
export const MAX_DECISIONS = 180;
export const SAFE_RADIUS = 25;
export const MOVE_SPEED = 8;
export const ARRIVAL_DISTANCE = 1.1;
export const FIRE_GAIN = 22;
export const MEAL_RELIEF = 44;

export const LOCATIONS = {
  wood: { x: 20, y: 38 },
  food: { x: 78, y: 34 },
  fire: { x: 51, y: 54 },
  rest: { x: 71, y: 68 },
  storage: { x: 32, y: 68 },
  camp: { x: 49, y: 65 },
  explore: { x: 13, y: 68 },
} satisfies Record<string, Point>;
export const MAP_ZONES = LOCATIONS;

export const ACTION_LABELS: Record<ActionId, string> = {
  wood: '采集木材', food: '采集食物', fire: '照看篝火', eat: '吃点东西',
  rest: '休息恢复', help: '帮助同伴', camp: '返回营地', explore: '探索荒野',
};
export const ACTION_DURATIONS: Record<ActionId, number> = {
  wood: 5.5, food: 5, fire: 3, eat: 3, rest: 6, help: 4.5, camp: 2.5, explore: 8,
};
export const EMOTION_LABELS: Record<Emotion, string> = {
  calm: '平静', happy: '开心', worried: '担心', annoyed: '不满', caring: '关切',
};
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  cozy: '轻松露营', normal: '荒野求生', hard: '严酷长夜',
};
export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  standard: '寻常的一天', storm: '风雨将至', conflict: '各有心事',
};

export const DIFFICULTY_CONFIG = {
  cozy: { hungerRate: .25, fireRate: .29, damage: .72, wood: 6, food: 6, fire: 82, danger: 10 },
  normal: { hungerRate: .43, fireRate: .72, damage: 1, wood: 3, food: 3, fire: 68, danger: 17 },
  hard: { hungerRate: .56, fireRate: 1.05, damage: 1.25, wood: 2, food: 2, fire: 57, danger: 27 },
} satisfies Record<Difficulty, { hungerRate: number; fireRate: number; damage: number; wood: number; food: number; fire: number; danger: number }>;

export const NPC_PROFILES: Pick<Npc, 'id' | 'name' | 'role' | 'color' | 'personality'>[] = [
  { id: 'azhuang', name: '阿壮', role: '勇敢的行动派', color: '#e8bd70', personality: { bravery: .9, diligence: .82, empathy: .4 } },
  { id: 'xiaomi', name: '小米', role: '谨慎的观察者', color: '#8bbcaf', personality: { bravery: .27, diligence: .78, empathy: .65 } },
  { id: 'laozhou', name: '老周', role: '可靠的热心人', color: '#b494c6', personality: { bravery: .56, diligence: .65, empathy: .96 } },
  { id: 'linlan', name: '林岚', role: '公正的协调者', color: '#d58e91', personality: { bravery: .62, diligence: .94, empathy: .75 } },
  { id: 'aye', name: '阿野', role: '好奇的探索者', color: '#8ca9db', personality: { bravery: .77, diligence: .47, empathy: .49 } },
];

/** Identity-based initial values also serve explicit legacy-save migration. */
export function createNpc(id: NpcId, elapsed = 0, scenario: ScenarioId = 'standard'): Npc {
  const index = NPC_PROFILES.findIndex(profile => profile.id === id);
  if (index < 0) throw new Error('Unknown companion');
  const profile = NPC_PROFILES[index];
  const position = [{ x: 46, y: 65 }, { x: 49, y: 67 }, { x: 52, y: 69 }, { x: 56, y: 68 }, { x: 60, y: 72 }][index];
  return {
    ...profile, personality: { ...profile.personality },
    health: 100, energy: [88, 84, 80, 86, 91][index],
    hunger: [26, 22, 32, 28, 24][index] + (scenario === 'conflict' ? 22 : 0),
    morale: [76, 72, 80, 77, 83][index], trust: [76, 70, 84, 73, 68][index] - (scenario === 'conflict' ? 24 : 0),
    fear: [8, 22, 12, 14, 10][index], wetness: 0,
    position: { ...position }, destination: { ...position },
    action: null, command: scenario === 'conflict' ? 'wood' : null,
    progress: 0, actionDuration: 0, decisionIn: 0, emotion: 'calm', speech: '', speechUntil: elapsed,
    injured: false, alive: true, inventory: { wood: 0, food: 0 },
    completedTasks: 0, refusals: 0, lastInteraction: 0,
  };
}

export function clamp(value: number, min = 0, max = 100): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isAtCamp(npc: Npc): boolean {
  return distance(npc.position, LOCATIONS.fire) < SAFE_RADIUS;
}
