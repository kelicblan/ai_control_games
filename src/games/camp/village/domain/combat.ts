import type { Point } from './types';
export interface EnemyInstance { id: string; archetypeId: string; hp: number; position: Point; nextAttackAt: number; waveId: string; deathEventId: string | null; threat?: number }
export interface CombatState {
  version: 1; enemies: Record<string, EnemyInstance>; cooldowns: Record<string, number>;
  fenceGeometry: { center: Point; radius: number; kind?: 'shared-world'; gatePosition?: Point }; gateOpen?: boolean; navigationRevision: number;
  waves: Record<string, string>; loot: Record<string, string>; unlockedRecipes: string[];
  downedAt: Record<string, number>; carriedBy: Record<string, string>; randomCounter: number;
  /** A save upgrade does not retroactively create attacks from before this epoch. */
  waveEpoch?: number;
}
