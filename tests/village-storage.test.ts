import {describe,expect,it} from 'vitest';
import {TERRAIN,getTaskDestination} from '../src/games/camp/simulation/terrain';
import {LOCATIONS} from '../src/games/camp/simulation/constants';
import {VILLAGE_FACILITIES} from '../src/games/camp/world/villageLayout';
import {NPC_IDS} from '../src/games/camp/simulation/types';
import {worldCanTraverse} from '../src/games/camp/world/navigation';

describe('village supply stations',()=>{
 it('moves supplies and all meal/delivery stations into the actual warehouse',()=>{
  const warehouse=VILLAGE_FACILITIES.find(f=>f.id==='warehouse')!;
  const crates=TERRAIN.find(o=>o.id==='camp-storage')!;
  expect(crates.shape.center).toEqual({x:warehouse.center.x,y:warehouse.center.y-1});
  expect(LOCATIONS.storage).toEqual(warehouse.center);
  for(const id of NPC_IDS){
   const station=getTaskDestination('eat',id);
   expect(station.x).toBeGreaterThanOrEqual(warehouse.center.x-6);
   expect(station.x).toBeLessThanOrEqual(warehouse.center.x+6);
   expect(station.y).toBeGreaterThan(warehouse.center.y);
   expect(station.y).toBeLessThan(warehouse.center.y+warehouse.half.y);
   expect(worldCanTraverse(station,station,17)).toBe(true);
   expect(getTaskDestination('camp',id,true)).toEqual(station);
  }
 });
});
