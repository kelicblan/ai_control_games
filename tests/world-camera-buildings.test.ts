import { describe,expect,it } from 'vitest';
import { buildingWalls } from '../packages/world-core/src/buildings';
import { LOCATIONS,createNpc,isAtCamp } from '../src/games/camp/simulation/constants';
import { findRoute,isWalkable } from '../src/games/camp/simulation/physics';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import { NPC_IDS } from '../src/games/camp/simulation/types';
import { CAMP_HOUSES } from '../src/games/camp/world/definition';

describe('自由相机与可进入的茅草房',()=>{
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
