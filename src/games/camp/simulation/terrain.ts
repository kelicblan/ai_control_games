import { TERRAIN as CAMP_TERRAIN, getTaskDestination as campDestination } from './campTerrain';
import type { TerrainObject as CampObject, TerrainKind as CampKind } from './campTerrain';
import type { ActionId, NpcId, Point } from './types';
import { CAMP_HOUSES } from '../world/definition';
import { buildingWalls } from '../../../../packages/world-core/src/buildings';

export { GROUND_BOUNDS, NPC_RADIUS, NAVIGATION_CLEARANCE } from './campTerrain';
export type { ColliderShape, TerrainHazard } from './campTerrain';
export type TerrainKind = CampKind | 'house';
export interface TerrainObject extends Omit<CampObject, 'kind'> { kind: TerrainKind }
const crew = CAMP_HOUSES.find(house => house.id === 'crew-house')!;
/** 覆盖判定与新伙伴长屋一致，不能房子已经搬走，雨中休息仍用旧帐篷位置。 */
export const SHELTER_COVER = Object.freeze({center:crew.center,half:crew.half});
// 保留旧对象的稳定ID以读取历史碰撞记录，但移除新房屋占地内的旧模型和阻挡。
const replaced = new Set(['rest-tent','south-rock','frame-pine-5']);
export const TERRAIN: readonly TerrainObject[] = [
  ...CAMP_TERRAIN.map(object => replaced.has(object.id)
    ? {...object,kind:'house' as const,solid:false} : object),
  ...CAMP_HOUSES.flatMap(house => buildingWalls(house).map(wall => ({
    id:`${house.id}-${wall.id}`,kind:'house' as const,label:house.name,
    shape:{type:'aabb' as const,center:wall.center,half:wall.half},solid:true,
  }))),
];
const NPC_INDEX:Record<NpcId,number>={azhuang:0,xiaomi:1,laozhou:2,linlan:3,aye:4};
/** 每位伙伴有独立床位；携物返送仍使用原有补给箱任务，不在床上凭空入库。 */
export function getTaskDestination(action:ActionId,npcId:NpcId,carrying=false,helpTarget?:Point):Point {
  if(action==='rest'&&!carrying)return {...crew.beds[NPC_INDEX[npcId]]};
  return campDestination(action,npcId,carrying,helpTarget);
}
