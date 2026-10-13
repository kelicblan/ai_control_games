import { coordinateRandom, seededNoise, type WorldPoint } from '../../../../packages/world-core/src';

/** 营地专属地理参数。通用世界包不得反向引用这个文件。 */
export const CAMP_CENTER: WorldPoint = Object.freeze({x: 50, y: 55});
export const INITIAL_EXPLORED_RADIUS = 1000;
export const GENERATOR_VERSION = 1;
export const CAMP_BOUNDS = Object.freeze({minX:-10, maxX:110, minY:5, maxY:115});
export interface HouseDefinition {
  id: string; name: string; center: WorldPoint; half: WorldPoint;
  doorWidth: number; wallHeight: number; roofHeight: number;
  beds: readonly WorldPoint[];
}
export const CAMP_HOUSES: readonly HouseDefinition[] = [
  {id:'lord-house', name:'领主茅草屋', center:{x:27,y:90}, half:{x:6,y:7}, doorWidth:4.2,
    wallHeight:5, roofHeight:8.5, beds:[{x:24,y:87}]},
  {id:'crew-house', name:'伙伴长屋', center:{x:71,y:84}, half:{x:11,y:7}, doorWidth:5,
    wallHeight:5, roofHeight:8.5, beds:[{x:64,y:81},{x:71,y:81},{x:78,y:81},{x:65,y:86},{x:77,y:86}]},
];

export interface SurfaceSample {
  height: number; water: boolean; waterLevel: number;
  forest: number; road: number; biome: 'grass' | 'forest' | 'mountain' | 'river';
}
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** 先定义跨块河流中心线，再由地面、河面和地图共同查询；中间延续旧营地的溪流。 */
export function riverCenter(y: number): number {
  const away = Math.max(0, Math.abs(y - 50) - 160);
  return 89 + smooth(away / 360) * (210 + Math.sin(y / 230) * 55 + Math.sin(y / 710) * 42);
}
export function riverHalfWidth(y: number): number { return 3.3 + smooth((Math.abs(y - 50) - 160) / 360) * 7; }
export function sampleCampSurface(point: WorldPoint, seed: number): SurfaceSample {
  const {x, y} = point, radius = Math.hypot(x - 50, y - 55);
  const riverDistance = Math.abs(x - riverCenter(y)), width = riverHalfWidth(y);
  const broad = seededNoise(x / 700, y / 700, seed ^ 417);
  const rolling = seededNoise(x / 160, y / 160, seed ^ 931);
  const northRidge = 155 * Math.exp(-(((y + 690) / 220) ** 2)) * (.52 + .48 * seededNoise(x / 210, 1, seed ^ 59));
  const westPeak = 105 * Math.exp(-((x + 500) ** 2 + (y + 710) ** 2) / 72000);
  let height = ((broad - .45) * 25 + rolling * 14 + northRidge + westPeak) * smooth((radius - 125) / 210);
  // 河面沿同一全局方向缓慢降低，绝不逐块随机高度；初始溪段延续旧河面。
  const waterLevel = -.18 - Math.sign(y - 50) * Math.max(0, Math.abs(y - 50) - 160) * .0015;
  const bankBlend = smooth((riverDistance - width) / 9);
  height = (waterLevel - 1.7) * (1 - bankBlend) + height * bankBlend;
  // 营地房屋/道路所在安全平地。只在实际溪床保留凹槽。
  if (radius < 95 && riverDistance > width + 4) height = -.045;
  const patches = Math.max(
    Math.exp(-((x + 190) ** 2 + (y - 70) ** 2) / 48000),
    Math.exp(-((x + 340) ** 2 + (y + 220) ** 2) / 65000),
    Math.exp(-((x - 470) ** 2 + (y - 370) ** 2) / 80000),
    (seededNoise(x / 230, y / 230, seed ^ 4111) - .48) * 1.7,
  );
  const road = Math.max(0, 1 - Math.abs(y - 55 - Math.sin((x - 50) / 150) * 22) / 4);
  const forest = Math.max(0, Math.min(1, patches + (rolling - .5) * .3)) * smooth((radius - 100) / 60) * (1 - road);
  const water = riverDistance < width;
  return {height, water, waterLevel, forest, road, biome:water ? 'river' : height > 65 ? 'mountain' : forest > .42 ? 'forest' : 'grass'};
}
/** 每个整数网格独立生成，地图块跨接处没有重复树或遗漏树。 */
export function treeAt(cellX: number, cellY: number, seed: number): {point:WorldPoint; size:number} | null {
  const spacing = 20;
  const point = {x:(cellX + .2 + coordinateRandom(cellX,cellY,seed) * .6) * spacing,
    y:(cellY + .2 + coordinateRandom(cellX,cellY,seed ^ 8191) * .6) * spacing};
  const surface = sampleCampSurface(point, seed);
  if (surface.water || surface.height > 130 || Math.hypot(point.x-50,point.y-55)<145
    || coordinateRandom(cellX,cellY,seed ^ 311)<1-surface.forest*.9) return null;
  return {point,size:7 + coordinateRandom(cellX,cellY,seed ^ 67)*8};
}
