import {describe,it,expect} from 'vitest';
import {OrthographicCamera,Vector3} from 'three';
import {buildingWalls} from '../packages/world-core/src/buildings';
import {configureCamera,defaultOrbit,groundFromScreen,projectWorld,panOrbit} from '../packages/world-three/src/camera';
import {CAMP_HOUSES} from '../src/games/camp/world/definition';
import {getTaskDestination} from '../src/games/camp/simulation/terrain';
import {findRoute,isWalkable} from '../src/games/camp/simulation/physics';
import {NPC_IDS} from '../src/games/camp/simulation/types';
import {LOCATIONS,createNpc,isAtCamp} from '../src/games/camp/simulation/constants';

describe('自由相机与可进入的茅草房',()=>{
 it('远处负坐标和重定位原点下，投影/高度拾取仍一致',()=>{
  const camera=new OrthographicCamera(),orbit=defaultOrbit(),origin=new Vector3(2048,0,-3072);
  orbit.focus.set(1950,80,-3050);configureCamera(camera,1200,800,orbit,origin);
  const screen=projectWorld(camera,orbit.focus,1200,800,origin);
  expect(screen.x).toBeCloseTo(600,5);expect(screen.y).toBeCloseTo(400,5);
  const p=groundFromScreen(camera,600,400,1200,800,()=>80,origin)!;
  expect(p.x).toBeCloseTo(2000,2);expect(p.y).toBeCloseTo(-3000,2);
  const before=orbit.focus.clone();panOrbit(camera,orbit,100,20,800);
  expect(orbit.focus.distanceTo(before)).toBeGreaterThan(1);
 });
 it('长屋门口有实际通道，墙体阻止穿透',()=>{
  const house=CAMP_HOUSES[1],walls=buildingWalls(house);
  expect(walls).toHaveLength(5);
  for(let y=house.center.y;y<house.center.y+house.half.y+6;y+=.1)expect(walls.some(w=>Math.abs(house.center.x-w.center.x)<w.half.x+1.1&&Math.abs(y-w.center.y)<w.half.y+1.1)).toBe(false);
  expect(()=>buildingWalls({...house,doorWidth:100})).toThrow();
 });
 it('五个休息点都能从营地到达，且属于营地安全区',()=>{
  for(const id of NPC_IDS){const p=getTaskDestination('rest',id);expect(isWalkable(p,true)).toBe(true);
   expect(findRoute(LOCATIONS.camp,p,true).length).toBeGreaterThan(0);
   const npc=createNpc(id);npc.position=p;expect(isAtCamp(npc)).toBe(true);}
 });
});
