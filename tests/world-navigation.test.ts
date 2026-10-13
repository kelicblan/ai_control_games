import {describe,it,expect} from 'vitest';
import { findGridRoute } from '../packages/world-core/src/navigation';
import { createNpc } from '../src/games/camp/simulation/constants';
import { moveWorldBody, worldCanTraverse } from '../src/games/camp/world/navigation';
import { riverCenter, riverHalfWidth, treeAt, bridgeAt, isOnBridge } from '../src/games/camp/world/definition';
import { CAMP_HOUSES } from '../src/games/camp/world/definition';

describe('有预算的通用路线',()=>{
 it('不切穿墙角，并在固定预算内绕过障碍',()=>{
  const blocked=(p:{x:number;y:number})=>p.x>12&&p.x<28&&p.y>-20&&p.y<20;
  const clear=(a:{x:number;y:number},b:{x:number;y:number})=>{
   for(let i=0;i<=16;i++)if(blocked({x:a.x+(b.x-a.x)*i/16,y:a.y+(b.y-a.y)*i/16}))return false;return true;
  };
  const result=findGridRoute({x:0,y:0},{x:48,y:0},clear,{step:8,maxNodes:500});
  expect(result.reached).toBe(true);expect(result.visited).toBeLessThanOrEqual(500);
  let p={x:0,y:0};for(const next of result.points){expect(clear(p,next)).toBe(true);p=next;}
  expect(p).toEqual({x:48,y:0});
 });
 it('极远目标不会建立整个世界的导航网格',()=>{
  const result=findGridRoute({x:0,y:0},{x:1e9,y:-1e9},()=>true,{step:8,maxNodes:128,maxDistance:128});
  expect(result.visited).toBeLessThanOrEqual(128);expect(result.points.length).toBeLessThanOrEqual(129);
  expect(result.reached).toBe(false);expect(result.points.length).toBeGreaterThan(0);
 });
});
describe('世界行走与画面使用同一地理数据',()=>{
 it('真实树干阻挡通行，林中可绕行而非穿树',()=>{
  let tree:ReturnType<typeof treeAt>=null;
  for(let x=-20;x<0&&!tree;x++)for(let y=-10;y<15&&!tree;y++)tree=treeAt(x,y,17);
  expect(tree).not.toBeNull();const point=tree!.point;
  expect(worldCanTraverse({x:point.x-4,y:point.y},{x:point.x+4,y:point.y},17)).toBe(false);
  const npc=createNpc('azhuang');npc.position={x:point.x-10,y:point.y};const target={x:point.x+10,y:point.y};
  for(let i=0;i<100;i++){
   const r=moveWorldBody(npc,target,8,.25,[npc],17,true);npc.position=r.position;
   expect(Math.hypot(npc.position.x-point.x,npc.position.y-point.y)).toBeGreaterThan(1.1);
   if(r.arrived)break;
  }
  expect(Math.hypot(npc.position.x-target.x,npc.position.y-target.y)).toBeLessThan(.3);
 });
 it('跨块河流不能直穿，架桥的位置是真实可走的通道',()=>{
  const y=695,bridge=bridgeAt(1,17);
  expect(bridge.point.y).toBe(y);
  expect(isOnBridge({x:riverCenter(y),y})).toBe(true);
  expect(worldCanTraverse({x:riverCenter(y)-riverHalfWidth(y)-4,y}, {x:riverCenter(y)+riverHalfWidth(y)+4,y},17)).toBe(true);
  expect(worldCanTraverse({x:riverCenter(y+40)-20,y:y+40},{x:riverCenter(y+40)+20,y:y+40},17)).toBe(false);
 });
 it('人物经过桥面跨河，不能从任意位置游过深水',()=>{
  const npc=createNpc('azhuang');npc.position={x:72,y:55};const target={x:110,y:55};
  for(let i=0;i<80;i++){
   const result=moveWorldBody(npc,target,8,.25,[npc],17,true);npc.position=result.position;
   if(Math.abs(npc.position.x-riverCenter(npc.position.y))<riverHalfWidth(npc.position.y))expect(isOnBridge(npc.position)).toBe(true);
   if(result.arrived)break;
  }
  expect(Math.hypot(npc.position.x-target.x,npc.position.y-target.y)).toBeLessThan(.3);
 });
 it('仍可从营地经门口走到每个茅草屋床位',()=>{
  for(const house of CAMP_HOUSES)for(const bed of house.beds){
   const npc=createNpc('azhuang');npc.position={x:51,y:64};
   for(let i=0;i<150;i++){const r=moveWorldBody(npc,bed,8,.25,[npc],17,false);npc.position=r.position;if(r.arrived)break;}
   expect(Math.hypot(npc.position.x-bed.x,npc.position.y-bed.y)).toBeLessThan(.3);
  }
 });
});
