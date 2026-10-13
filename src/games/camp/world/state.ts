import { ExplorationMap, validPoint, type ExplorationSave } from '../../../../packages/world-core/src';
import type { GameState } from '../simulation/types';
import { CAMP_CENTER, GENERATOR_VERSION, INITIAL_EXPLORED_RADIUS } from './definition';

/** 世界快照只保存种子、生成规则版本和新增探索位，不保存无限地形网格。 */
export interface CampWorldState {
  schemaVersion: 1;
  revision: number;
  exploration: ExplorationSave;
}
export const NPC_SIGHT_RADIUS = 70;
export function createWorldState(seed: number): CampWorldState {
  return {schemaVersion:1,revision:0,exploration:new ExplorationMap({seed,
    generatorVersion:GENERATOR_VERSION,center:CAMP_CENTER,initialRadius:INITIAL_EXPLORED_RADIUS}).snapshot()};
}
/** 只由模拟调用。暂停、镜头浏览和小地图点击不能调用这个入口。 */
export function updateWorldExploration(state: GameState): void {
  const world = state.world ??= createWorldState(state.seed);
  const observers = state.npcs.filter(npc => npc.alive && validPoint(npc.position));
  // 开局所有角色都在已知圆内部，无需反复扫描/序列化同一片区域。
  if (observers.every(npc => Math.hypot(npc.position.x-world.exploration.center.x,
    npc.position.y-world.exploration.center.y)+NPC_SIGHT_RADIUS+16 <= world.exploration.initialRadius)) return;
  const map = ExplorationMap.restore(world.exploration, [GENERATOR_VERSION]);
  let changed = false;
  for (const npc of observers) changed = map.reveal(npc.position, NPC_SIGHT_RADIUS) || changed;
  if (changed) {world.exploration=map.snapshot();world.revision++;}
}
/** 校验受控的存档入口，禁止悄悄接受其他种子/生成器生成的地图。 */
export function validWorldState(raw: unknown, seed: number): raw is CampWorldState {
  try {
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) return false;
    const state=raw as CampWorldState;
    if (Object.keys(state).sort().join(',')!=='exploration,revision,schemaVersion' || state.schemaVersion!==1
      || !Number.isSafeInteger(state.revision) || state.revision<0) return false;
    const map=ExplorationMap.restore(state.exploration,[GENERATOR_VERSION]);
    return map.seed===seed && map.center.x===CAMP_CENTER.x && map.center.y===CAMP_CENTER.y
      && map.initialRadius===INITIAL_EXPLORED_RADIUS;
  } catch { return false; }
}
