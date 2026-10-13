import type { WorldPoint } from './index';

/** 通用矩形房屋布局；入口固定在局部+y侧，游戏可在适配层旋转整个建筑。 */
export interface BuildingFootprint { center: WorldPoint; half: WorldPoint; doorWidth: number }
export interface WallFootprint { id: string; center: WorldPoint; half: WorldPoint }
/** 渲染与物理必须共同使用此函数，不能一边挖门、一边仍使用整栋实心盒。 */
export function buildingWalls(house: BuildingFootprint, thickness = .45): WallFootprint[] {
  const {center, half, doorWidth} = house;
  if (![center.x,center.y,half.x,half.y,doorWidth,thickness].every(Number.isFinite)
    || half.x <= 0 || half.y <= 0 || thickness <= 0 || doorWidth <= 0
    || doorWidth >= half.x * 2 - thickness * 2) throw new RangeError('房屋尺寸或门洞宽度无效');
  const sideWidth = (half.x * 2 - doorWidth) / 2;
  return [
    {id:'west',center:{x:center.x-half.x,y:center.y},half:{x:thickness/2,y:half.y}},
    {id:'east',center:{x:center.x+half.x,y:center.y},half:{x:thickness/2,y:half.y}},
    {id:'back',center:{x:center.x,y:center.y-half.y},half:{x:half.x,y:thickness/2}},
    {id:'front-west',center:{x:center.x-half.x+sideWidth/2,y:center.y+half.y},half:{x:sideWidth/2,y:thickness/2}},
    {id:'front-east',center:{x:center.x+half.x-sideWidth/2,y:center.y+half.y},half:{x:sideWidth/2,y:thickness/2}},
  ];
}
