import { ensure,record } from '../../packages/action-runtime/src/json';
import { createAtmosphere, initialWeatherDelay, updateAtmosphere, WEATHER_KINDS, windDirectionLabel, type WeatherClock } from '../../src/games/camp/simulation/weather';
import { environmentalMix, thunderMix } from '../../src/games/camp/simulation/ambient';
import { CAMP_HOUSES } from '../../src/games/camp/world/definition';
import { VILLAGE_FACILITIES } from '../../src/games/camp/world/villageLayout';
import type { VillageState, Point } from '../../src/games/camp/village/domain/types';
export function validateVillageWeather(state:VillageState){
  const weather=state as VillageState & Partial<WeatherClock>;
  if(weather.weather!==undefined||weather.atmosphere!==undefined||weather.weatherUntil!==undefined){
    const a=weather.atmosphere;ensure(WEATHER_KINDS.includes(weather.weather!)&&record(a)&&Number.isFinite(weather.weatherUntil)&&(weather.weatherUntil??-1)>=0,'Invalid village weather');
    ensure([a.windStrength,a.rainIntensity,a.cloudCover,a.stormRisk].every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Number.isFinite(a.windAngle)&&a.windAngle>=0&&a.windAngle<Math.PI*2,'Invalid village atmosphere');
    ensure(Number.isSafeInteger(a.revision)&&a.revision>=0&&Number.isFinite(a.lightningAt)&&a.lightningAt>=-1&&Number.isFinite(a.nextLightningAt)&&a.nextLightningAt>=0,'Invalid village lightning');
    ensure(a.lightningPoint===null||record(a.lightningPoint)&&[a.lightningPoint.x,a.lightningPoint.y].every(Number.isFinite),'Invalid village lightning location');
  }
}

/** Older saves acquire a deterministic front at their current time without changing their inventory. */
export function villageWeather(state: VillageState): VillageState & WeatherClock {
  validateVillageWeather(state);const weather=state as VillageState & Partial<WeatherClock>;
  if(weather.weather===undefined){weather.weather='clear';weather.atmosphere=createAtmosphere(state.seed);weather.weatherUntil=state.elapsed+initialWeatherDelay(state.seed);}
  return weather as VillageState & WeatherClock;
}
export function villageCover(point:Point){
  const roofs=[...CAMP_HOUSES,...VILLAGE_FACILITIES.filter(f=>f.wallHeight>0)];
  const shelterDistance=Math.min(...roofs.map(r=>Math.hypot(Math.max(0,Math.abs(point.x-r.center.x)-r.half.x),Math.max(0,Math.abs(point.y-r.center.y)-r.half.y))));
  return {shelterDistance,exposure:shelterDistance===0?.04:1};
}
export function advanceVillageWeather(state:VillageState,dt:number){
  const weather=villageWeather(state);updateAtmosphere(weather,dt);
  for(const actor of Object.values(state.actors)){
    const {exposure}=villageCover(actor.position),rain=weather.atmosphere.rainIntensity,wind=weather.atmosphere.windStrength;
    const drying=exposure<1?2.3*(1-exposure):rain<.1?.42:.06;
    actor.body.wetness=Math.max(0,Math.min(100,actor.body.wetness+(rain*exposure*3.1-drying)*dt));
    actor.body.energy=Math.max(0,actor.body.energy-(actor.body.wetness/100*.14+rain*wind*.12)*exposure*dt);
  }
}
export function villageEnvironment(state:VillageState,speed:number){
  const weather=villageWeather(state),atmosphere=weather.atmosphere,environment={fire:0,listener:state.actors[state.playerId].position,seed:state.seed,timeScale:state.paused?0:speed};
  const toward=windDirectionLabel(atmosphere.windAngle),from=windDirectionLabel(atmosphere.windAngle+Math.PI);
  return {weather:{kind:weather.weather,toward,from,crew:Object.values(state.actors).map(a=>({npcId:a.id,wetness:a.body.wetness,...villageCover(a.position)}))},audio:{ambient:environmentalMix(atmosphere,state.elapsed,environment),thunder:thunderMix(atmosphere,state.elapsed,environment)}};
}
