import { TERRAIN as CAMP_TERRAIN, getTaskDestination as campDestination } from './campTerrain';
import type { TerrainObject as CampObject, TerrainKind as CampKind } from './campTerrain';
import type { ActionId, NpcId, Point } from './types';
import { CAMP_HOUSES,riverCenter,riverHalfWidth } from '../world/definition';
import { buildingWalls } from '../../../../packages/world-core/src/buildings';
import {SETTLEMENT_WALLS,WATCHTOWER,PLANTED_TREES} from '../world/settlement';
import {FACILITY_WALLS} from '../world/villageLayout';

export { NPC_RADIUS, NAVIGATION_CLEARANCE } from './campTerrain';
import { MAX_COORDINATE } from '../../../../packages/world-core/src';
/** 仅防止超出浮点安全范围，不是原营地或已探索区域的边界。 */
export const GROUND_BOUNDS = Object.freeze({minX:-MAX_COORDINATE,maxX:MAX_COORDINATE,minY:-MAX_COORDINATE,maxY:MAX_COORDINATE});
export type { ColliderShape, TerrainHazard } from './campTerrain';
export type TerrainKind = CampKind | 'house';
export interface TerrainObject extends Omit<CampObject, 'kind'> { kind: TerrainKind; navigationPoints?:readonly Point[] }
const crew = CAMP_HOUSES.find(house => house.id === 'crew-house')!;
/** 覆盖判定与新伙伴长屋一致，不能房子已经搬走，雨中休息仍用旧帐篷位置。 */
export const SHELTER_COVER = Object.freeze({center:crew.center,half:crew.half});
// 保留旧对象的稳定ID以读取历史碰撞记录，但移除新房屋占地内的旧模型和阻挡。
const replaced = new Set(['rest-tent','south-rock','frame-pine-5']);
let plantedIndex=0;
export const TERRAIN: readonly TerrainObject[] = [
  ...CAMP_TERRAIN.map(object => object.id==='deep-creek'
    ? {...object,shape:{type:'aabb' as const,center:{x:riverCenter(55),y:55},half:{x:riverHalfWidth(55),y:160}},navigationPoints:[]}
    : object.kind==='tree'?{...object,shape:{type:'circle' as const,center:PLANTED_TREES[plantedIndex++%PLANTED_TREES.length].point,radius:1}}
    : replaced.has(object.id)
    ? {...object,kind:'house' as const,solid:false} : object),
  ...CAMP_HOUSES.flatMap(house => buildingWalls(house).map(wall => ({
    id:`${house.id}-${wall.id}`,kind:'house' as const,label:house.name,
    shape:{type:'aabb' as const,center:wall.center,half:wall.half},solid:true,
  }))),
  ...SETTLEMENT_WALLS,
  ...FACILITY_WALLS.map(wall=>({id:wall.id,kind:'house' as const,label:wall.name,solid:true,
    shape:{type:'aabb' as const,center:wall.center,half:wall.half}})),
  ...PLANTED_TREES.slice(plantedIndex).map((tree,i)=>({id:`planted-tree-${i+plantedIndex}`,kind:'tree' as const,label:'庭院树木',solid:true,
    shape:{type:'circle' as const,center:tree.point,radius:1}})),
  {id:'settlement-watchtower',kind:'house',label:'瞭望塔',solid:true,shape:{type:'aabb',...WATCHTOWER}},
];
const NPC_INDEX:Record<NpcId,number>={azhuang:0,xiaomi:1,laozhou:2,linlan:3,aye:4,tiesheng:5,aling:6,xiaoman:7,shenyan:8};
/** 每位伙伴有独立床位；携物返送仍使用原有补给箱任务，不在床上凭空入库。 */
export function getTaskDestination(action:ActionId,npcId:NpcId,carrying=false,helpTarget?:Point):Point {
  if(action==='rest'&&!carrying)return {...CAMP_HOUSES[NPC_INDEX[npcId]+1].beds[0]};
  return campDestination(action,npcId,carrying,helpTarget);
}
