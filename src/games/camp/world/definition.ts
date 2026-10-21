import {newWorld,newWorldHeight,newWorldWalkable} from './newWorldProfile';
import {insideSettlement} from './settlement';
import {VILLAGE_HOMES,villageClearance} from './villageLayout';
import { coordinateRandom, seededNoise, type WorldPoint } from '../../../../packages/world-core/src';
import {landscapeHeight,landscapeRiverX,landscapeRiverWidth,landscapeWaterLevel,landscapeRoad} from './landscape';

/** 营地专属地理参数。通用世界包不得反向引用这个文件。 */
export const CAMP_CENTER: WorldPoint = Object.freeze(newWorld?.center??{x: 50, y: 55});
export const INITIAL_EXPLORED_RADIUS = 1000;
export const GENERATOR_VERSION = 1;
export const CAMP_BOUNDS = Object.freeze({minX:-100, maxX:200, minY:-95, maxY:205});
export interface HouseDefinition {
  id: string; name: string; center: WorldPoint; half: WorldPoint;
  doorWidth: number; doorHeight?: number; wallHeight: number; roofHeight: number;
  beds: readonly WorldPoint[];
}
export const CAMP_HOUSES: readonly HouseDefinition[] = [
  // 人物约7.45高；民居墙高15、门高11，领主府使用更高的厅堂比例。
  {id:'lord-house', name:'领主府', center:{x:50,y:-45}, half:{x:27,y:19}, doorWidth:12,doorHeight:16,
    wallHeight:26, roofHeight:48, beds:[{x:50,y:-43}]},
  ...VILLAGE_HOMES.map(p=>({
    id:p.id,name:p.name,center:p.center,half:{x:12,y:10},doorWidth:5,
    doorHeight:11,wallHeight:15,roofHeight:27,beds:[{x:p.center.x,y:p.center.y+2}],
  })),
];

if(newWorld?.houses?.length){for(const [i,house] of CAMP_HOUSES.entries()){const source=i===0?newWorld.houses.find(h=>h.id==='H')!:newWorld.houses.filter(h=>h.id!=='H')[(i-1)%5];if(source)Object.assign(house,{center:{...source.center},half:{...source.half},wallHeight:source.height*.5,roofHeight:source.height,doorHeight:2,doorWidth:1.5,beds:[{...source.rest}]});}}

export interface SurfaceSample {
  height: number; water: boolean; waterLevel: number;
  forest: number; road: number; biome: 'grass' | 'forest' | 'mountain' | 'river';
}
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** 先定义跨块河流中心线，再由地面、河面和地图共同查询；中间延续旧营地的溪流。 */
export function riverCenter(y: number): number {
  return landscapeRiverX(y);
}
export function riverHalfWidth(y: number): number { return landscapeRiverWidth(y); }
/** 每640米配置一个河谷通行点。索引来自全局坐标，跨块不重复、不随机跳变。 */
export const BRIDGE_INTERVAL = 640;
export interface BridgeDefinition {point:WorldPoint; halfLength:number; halfWidth:number; height:number}
export const GATE_BRIDGE=Object.freeze({point:{x:50,y:270},halfLength:19,halfWidth:6,height:.4,axis:'y' as const});
export function bridgeAt(index:number, _seed=0):BridgeDefinition {
  const y=55+index*BRIDGE_INTERVAL;
  const waterLevel=-.18-Math.sign(y-50)*Math.max(0,Math.abs(y-50)-160)*.0015;
  return {point:{x:riverCenter(y),y},halfLength:riverHalfWidth(y)+9,halfWidth:6,height:waterLevel+.5};
}
export function isOnBridge(point:WorldPoint):boolean {
  if(Math.abs(point.x-GATE_BRIDGE.point.x)<=GATE_BRIDGE.halfWidth&&Math.abs(point.y-GATE_BRIDGE.point.y)<=GATE_BRIDGE.halfLength)return true;
  const bridge=bridgeAt(Math.round((point.y-55)/BRIDGE_INTERVAL));
  return Math.abs(point.y-bridge.point.y)<=bridge.halfWidth && Math.abs(point.x-bridge.point.x)<=bridge.halfLength;
}
export function walkingHeight(point:WorldPoint,seed:number):number {
  if(newWorld)return newWorldHeight(point);
  if(Math.abs(point.x-GATE_BRIDGE.point.x)<=GATE_BRIDGE.halfWidth&&Math.abs(point.y-GATE_BRIDGE.point.y)<=GATE_BRIDGE.halfLength)return GATE_BRIDGE.height;
  return isOnBridge(point)?bridgeAt(Math.round((point.y-55)/BRIDGE_INTERVAL)).height:sampleCampSurface(point,seed).height;
}
export function sampleCampSurface(point: WorldPoint, seed: number): SurfaceSample {
  if(newWorld){const height=newWorldHeight(point),water=!newWorldWalkable(point);return {height,water,waterLevel:0,forest:0,road:water?0:1,biome:water?'river':'grass'};}
  const {x, y} = point, radius = Math.hypot(x - 50, y - 55);
  const riverDistance = Math.abs(x - riverCenter(y)), width = riverHalfWidth(y);
  const height=landscapeHeight(x,y),waterLevel=landscapeWaterLevel(y);
  const patches = Math.max(
    Math.exp(-((x + 190) ** 2 + (y - 70) ** 2) / 48000),
    Math.exp(-((x + 340) ** 2 + (y + 220) ** 2) / 65000),
    Math.exp(-((x - 470) ** 2 + (y - 370) ** 2) / 80000),
    (seededNoise(x / 230, y / 230, seed ^ 4111) - .48) * 1.7,
  );
  const road = landscapeRoad(x,y);
  const woodland=seededNoise(x/105,y/105,seed^4511)*.68+seededNoise(x/43,y/43,seed^9011)*.32;
  const forest = smooth((woodland-.30)/.38)*(.65+patches*.35)*smooth((radius - 158) / 32)*(1-road);
  const water = riverDistance < width;
  return {height, water, waterLevel, forest, road, biome:water ? 'river' : height > 65 ? 'mountain' : forest > .42 ? 'forest' : 'grass'};
}
/** 每个整数网格独立生成，地图块跨接处没有重复树或遗漏树。 */
export function treeAt(cellX: number, cellY: number, seed: number): {point:WorldPoint; size:number} | null {
  const spacing = 20;
  const candidate=(cx:number,cy:number)=>({x:(cx+.5+(coordinateRandom(cx,cy,seed)-.5)*2.1)*spacing,
    y:(cy+.5+(coordinateRandom(cx,cy,seed^8191)-.5)*2.1)*spacing});
  const point=candidate(cellX,cellY);
  const surface = sampleCampSurface(point, seed);
  const bridge=bridgeAt(Math.round((point.y-55)/BRIDGE_INTERVAL));
  const bridgeApproach=Math.abs(point.y-bridge.point.y)<10&&Math.abs(point.x-bridge.point.x)<bridge.halfLength+16;
  if (surface.water || isOnBridge(point) || bridgeApproach || surface.road>.01 || surface.height > 260 || insideSettlement(point.x,point.y,15) || villageClearance(point.x,point.y,15)
    || coordinateRandom(cellX,cellY,seed ^ 311)<1-surface.forest**.8*.98) return null;
  if(surface.height>35&&Math.hypot(landscapeHeight(point.x+2,point.y)-surface.height,landscapeHeight(point.x,point.y+2)-surface.height)>2.6)return null;
  const priority=coordinateRandom(cellX,cellY,seed^719);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const neighbor=candidate(cellX+dx,cellY+dy);
    if(Math.hypot(neighbor.x-point.x,neighbor.y-point.y)<6&&coordinateRandom(cellX+dx,cellY+dy,seed^719)<priority)return null;}
  return {point,size:18 + coordinateRandom(cellX,cellY,seed ^ 67)*14};
}
