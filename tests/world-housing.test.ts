import {describe,it,expect} from 'vitest';
import { Vector3, Group, Mesh } from 'three';
import { CAMP_HOUSES } from '../src/games/camp/world/definition';
import { createExpandedCamp } from '../src/games/camp/world/environment';
import { createThatchedHouses } from '../packages/world-three/src/buildings';
import { Shapes } from '../src/scene/geometry';
import { RainSurfaces } from '../src/scene/rainSurfaces';
import { createGame } from '../src/games/camp/simulation/engine';
import { getWeatherSnapshot } from '../src/games/camp/simulation/weather';

describe('房屋实体、剖视和避雨一致',()=>{
 it('领主屋和伙伴长屋的屋内都能避雨，旧帐篷位置不能继续隐形挡雨',()=>{
  const state=createGame(),npc=state.npcs[0];
  for(const house of CAMP_HOUSES){npc.position={...house.beds[0]};expect(getWeatherSnapshot(state,npc).exposure).toBeCloseTo(.04);}
  npc.position={x:71,y:72.5};expect(getWeatherSnapshot(state,npc).exposure).toBe(1);
 });
 it('屋顶剖开后仍挡雨，射线命中的是实际茅草顶',()=>{
  const homes=createThatchedHouses(CAMP_HOUSES),surfaces=new RainSurfaces(homes.roofs,homes.roofs[1]);
  const point=new Vector3(),normal=new Vector3();
  for(const house of CAMP_HOUSES){
   homes.setSelectedPosition(house.beds[0]);homes.group.updateMatrixWorld(true);surfaces.refresh();
   const roof=homes.roofs.find(r=>r.name.startsWith(house.id))!;expect(roof.visible).toBe(false);
   expect(surfaces.intersect(house.center.x-50,house.center.y-50,0,0,point,normal)).toBe(true);
   expect(point.y).toBeCloseTo(house.roofHeight,4);expect(normal.y).toBeGreaterThan(0);
  }
  homes.dispose();homes.dispose();
 });
 it('重定位渲染原点后，世界坐标雨点仍命中同一屋顶',()=>{
  const origin=new Vector3(2048,0,-1024),shapes=new Shapes(),camp=createExpandedCamp(shapes,origin);
  const root=new Group();root.position.copy(origin).multiplyScalar(-1);root.add(camp.group);
  const game=createGame();camp.update(0,game,true);root.updateMatrixWorld(true);camp.rainSurfaces.refresh();
  const point=new Vector3();expect(camp.rainSurfaces.intersect(21,34,0,0,point)).toBe(true);
  expect(point.x).toBeCloseTo(21);expect(point.z).toBeCloseTo(34);expect(point.y).toBeCloseTo(CAMP_HOUSES[1].roofHeight,4);
  expect(camp.group.getObjectByName('Rest shelter canvas awning')).toBeUndefined();
  expect(camp.group.getObjectByName('Pitched canvas with pinned ridge and seams')).toBeUndefined();
  camp.dispose();
  const seen=new Set<unknown>();camp.group.traverse(o=>{if(o instanceof Mesh){if(!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}
   for(const m of Array.isArray(o.material)?o.material:[o.material])if(!seen.has(m)){seen.add(m);m.dispose();}}});shapes.dispose();
 });
});
