import { describe,expect,it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { getWeatherSnapshot } from '../src/games/camp/simulation/weather';
import { CAMP_HOUSES } from '../src/games/camp/world/definition';

describe('房屋实体、完整屋顶和避雨一致',()=>{
 it('领主屋和伙伴长屋的屋内都能避雨，旧帐篷位置不能继续隐形挡雨',()=>{
  const state=createGame(),npc=state.npcs[0];
  for(const house of CAMP_HOUSES){npc.position={...house.beds[0]};expect(getWeatherSnapshot(state,npc).exposure).toBeCloseTo(.04);}
  npc.position={x:71,y:72.5};expect(getWeatherSnapshot(state,npc).exposure).toBe(1);
 });
});
