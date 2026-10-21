import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { advanceVillageWeather,villageWeather,validateVillageWeather } from '../../scripts/world/village-weather';
import { CAMP_HOUSES } from '../../src/games/camp/world/definition';
import { createAtmosphere } from '../../src/games/camp/simulation/weather';
const rules=selectWorldRules('village-v1','p2-life-alpha-v1');
function fixture(){return createVillageState(rules,{id:'weather',classification:'fixture',worldId:'domain-weather',seed:17,inventory:{wood:14,food:10},actors:[{archetypeId:'H002',instanceId:'covered',initial:{position:{...CAMP_HOUSES[0].center}}},{archetypeId:'H002',instanceId:'exposed',initial:{position:{x:1,y:1}}}]});}
it('adds weather to an old checkpoint without resetting actors or stocks and preserves deterministic shelter effects',()=>{
  const state=fixture(),before=structuredClone(state);villageWeather(state);expect(state.actors).toEqual(before.actors);expect(state.inventory).toEqual(before.inventory);
  const weather=villageWeather(state);weather.weather='storm';weather.atmosphere=createAtmosphere(state.seed,'storm');weather.weatherUntil=100;
  const replay=structuredClone(state);for(let i=0;i<50;i++){state.elapsed+=.1;replay.elapsed+=.1;advanceVillageWeather(state,.1);advanceVillageWeather(replay,.1);}
  expect(state).toEqual(replay);expect(state.actors.exposed.body.wetness).toBeGreaterThan(10);expect(state.actors.covered.body.wetness).toBe(0);expect(state.actors.exposed.body.energy).toBeLessThan(state.actors.covered.body.energy);
});
it('rejects partial or out of bounds weather in a saved checkpoint',()=>{
  const state=villageWeather(fixture());delete (state as {atmosphere?:unknown}).atmosphere;expect(()=>validateVillageWeather(state)).toThrow();
  state.atmosphere=createAtmosphere(17);state.weatherUntil=20;state.atmosphere.rainIntensity=2;expect(()=>validateVillageWeather(state)).toThrow();
});
