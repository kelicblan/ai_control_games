import { LOCATIONS } from './constants';
import type { ActionId, NpcId, Point, ReactionKind } from './types';

/** Game coordinates map directly to Three.js ground: (x - 50, z = y - 50). */
export const GROUND_BOUNDS = Object.freeze({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
export const NPC_RADIUS = 1.1;
export const NAVIGATION_CLEARANCE = .35;

/** Open-sided rain cover over the existing rest stations; the canvas is not a ground barrier. */
export const SHELTER_COVER = Object.freeze({
  center: Object.freeze({ x: 71, y: 72.5 }),
  half: Object.freeze({ x: 6.5, y: 4 }),
});

export type TerrainKind = 'fire' | 'tree' | 'rock' | 'tent' | 'storage' | 'thorns' | 'water';
export type ColliderShape =
  | { type: 'circle'; center: Point; radius: number }
  | { type: 'aabb'; center: Point; half: Point };
export interface TerrainHazard {
  kind: Extract<ReactionKind, 'burn' | 'thorns' | 'water'>;
  damage: number; fear: number; energy: number; injury: boolean;
  cooldown: number;
  /** Hazard extends this far beyond the object's visible/solid footprint. */
  reach: number;
  /** Stable character order: azhuang, xiaomi, laozhou. */
  speech: readonly [string, string, string];
}
export interface TerrainObject {
  id: string; kind: TerrainKind; label: string;
  shape: ColliderShape; solid: boolean;
  hazard?: TerrainHazard;
}

/** Authoritative footprints shared by renderer, movement, damage and navigation. */
export const TERRAIN: readonly TerrainObject[] = [
  {
    id: 'campfire', kind: 'fire', label: '篝火',
    shape: { type: 'circle', center: { ...LOCATIONS.fire }, radius: 3.3 }, solid: true,
  },
  { id: 'rest-tent', kind: 'tent', label: '帐篷', shape: { type: 'aabb', center: { x: 71, y: 67 }, half: { x: 5, y: 3.1 } }, solid: true },
  { id: 'camp-storage', kind: 'storage', label: '补给箱', shape: { type: 'aabb', center: { x: LOCATIONS.storage.x, y: LOCATIONS.storage.y - 1 }, half: { x: 3.5, y: 2.5 } }, solid: true },
  { id: 'wood-stack', kind: 'storage', label: '木堆', shape: { type: 'aabb', center: { x: 20, y: 34 }, half: { x: 3, y: 2 } }, solid: true },
  { id: 'west-rock', kind: 'rock', label: '岩石', shape: { type: 'circle', center: { x: 36, y: 47 }, radius: 2.6 }, solid: true },
  { id: 'north-rock', kind: 'rock', label: '岩石', shape: { type: 'circle', center: { x: 59, y: 38 }, radius: 2.8 }, solid: true },
  { id: 'south-rock', kind: 'rock', label: '岩石', shape: { type: 'circle', center: { x: 63, y: 78 }, radius: 2.4 }, solid: true },
  { id: 'wood-pine-a', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 16, y: 34 }, radius: 1.5 }, solid: true },
  { id: 'wood-pine-b', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 24, y: 32 }, radius: 1.8 }, solid: true },
  { id: 'wood-pine-c', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 14, y: 44 }, radius: 1.6 }, solid: true },
  { id: 'camp-pine', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 42, y: 36 }, radius: 1.8 }, solid: true },
  { id: 'east-pine', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 77, y: 24 }, radius: 1.7 }, solid: true },
  { id: 'frame-pine-1', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 9, y: 62 }, radius: 1.3 }, solid: true },
  { id: 'frame-pine-2', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 18, y: 78 }, radius: 1.5 }, solid: true },
  { id: 'frame-pine-3', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 37, y: 85 }, radius: 1.5 }, solid: true },
  { id: 'frame-pine-4', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 58, y: 91 }, radius: 1.7 }, solid: true },
  { id: 'frame-pine-5', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 82, y: 82 }, radius: 1.5 }, solid: true },
  { id: 'frame-pine-6', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 97, y: 28 }, radius: 1.5 }, solid: true },
  { id: 'frame-pine-7', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 61, y: 20 }, radius: 1.7 }, solid: true },
  { id: 'frame-pine-8', kind: 'tree', label: '松树', shape: { type: 'circle', center: { x: 31, y: 20 }, radius: 1.5 }, solid: true },
  {
    id: 'berry-thorns', kind: 'thorns', label: '荆棘',
    shape: { type: 'circle', center: { x: 80, y: 46 }, radius: 3.2 }, solid: false,
    hazard: { kind: 'thorns', damage: 3.5, fear: 4, energy: 1, injury: true, cooldown: 2.5, reach: 0,
      speech: ['嘶！荆棘扎进来了，这路也太难走了！', '啊……这些刺好疼，衣服也被勾住了。', '哎哟，荆棘刮伤了！咱们绕过去。'] },
  },
  {
    id: 'deep-creek', kind: 'water', label: '深溪',
    // Both ends continue beyond the modeled ground and distant woodland.
    shape: { type: 'aabb', center: { x: 89, y: 50 }, half: { x: 3.3, y: 160 } }, solid: false,
    hazard: { kind: 'water', damage: 2.5, fear: 6, energy: 8, injury: false, cooldown: 3, reach: 0,
      speech: ['哇！水真冷！脚下一滑，差点栽进去。', '好冷！呜……溪边太滑了，我要上岸。', '哎哟，脚滑进水里了！大家离溪边远点。'] },
  },
];

const NPC_INDEX: Record<NpcId, number> = { azhuang: 0, xiaomi: 1, laozhou: 2, linlan: 3, aye: 4, tiesheng: 5, aling: 6, xiaoman: 7, shenyan: 8 };

/** Job stations belong outside their props; each worker has a separate standing slot. */
export function getTaskDestination(action: ActionId, npcId: NpcId, carrying = false, helpTarget?: Point): Point {
  const index = NPC_INDEX[npcId];
  // Preserve established stations, then extend into a second row for newcomers.
  const offset = [-3, 0, 3, -6, 6, -3, 0, 3, 6][index];
  const row = index < 5 ? 0 : 4;
  if (action === 'help' && helpTarget) {
    // Nine separated standing slots remain within the engine's 3.5m aid range.
    const angle = Math.PI + index * Math.PI * 2 / 9;
    const radius = 3.3;
    return { x: helpTarget.x + Math.cos(angle) * radius, y: helpTarget.y + Math.sin(angle) * radius };
  }
  if (action === 'fire') {
    const angle = Math.PI / 2 + index * Math.PI * 2 / 9;
    return { x: LOCATIONS.fire.x + Math.cos(angle) * 6.2, y: LOCATIONS.fire.y + Math.sin(angle) * 6.2 };
  }
  if (action === 'eat' || (carrying && (action === 'camp' || action === 'rest'))) return { x: LOCATIONS.storage.x + offset, y: LOCATIONS.storage.y + 4 + row };
  // 休息者可以长期占位。座位与帐篷南侧实体之间必须留出通道，否则左侧的
  // 林枫会把后来要去中间座位的伙伴堵在帐篷角；保留物理碰撞并加宽真实间距。
  if (action === 'rest') return { x: 71 + offset, y: 74.5 + row };
  const location = LOCATIONS[action as keyof typeof LOCATIONS] ?? LOCATIONS.camp;
  return { x: location.x + offset, y: location.y + row };
}
