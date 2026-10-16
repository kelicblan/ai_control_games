import {describe,expect,it} from 'vitest';
import {createGame} from '../src/games/camp/simulation/engine';
import {getWeatherSnapshot} from '../src/games/camp/simulation/weather';
import {VILLAGE_FACILITIES} from '../src/games/camp/world/villageLayout';

describe('public building weather cover',()=>{
 it('protects warehouse and smith occupants but leaves the open training ground exposed',()=>{
  const game=createGame({seed:17});
  for(const facility of VILLAGE_FACILITIES){
   const npc={...game.npcs[0],position:{...facility.center}};
   const weather=getWeatherSnapshot(game,npc);
   if(facility.id==='training-ground'){
    expect(weather.shelterDistance).toBeGreaterThan(0);expect(weather.exposure).toBe(1);
   }else{
    expect(weather.shelterDistance).toBe(0);expect(weather.exposure).toBeLessThan(.1);
   }
  }
 });
});
