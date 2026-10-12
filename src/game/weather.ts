import { clamp } from './constants';
import { SHELTER_COVER } from './terrain';
import type { Atmosphere, GameState, Npc, Weather, WeatherSnapshot } from './types';

const TAU = Math.PI * 2;
export const WEATHER_KINDS: readonly Weather[] = ['clear', 'wind', 'rain', 'storm'];
export const WEATHER_LABELS: Record<Weather, string> = { clear: '晴朗', wind: '山风', rain: '下雨', storm: '雷雨' };

/** Separate, stateless weather randomness: policy choices never consume this stream. */
function weatherRandom(seed: number, revision: number, channel: number): number {
  let value = seed ^ Math.imul(revision + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function initialWeatherDelay(seed: number): number {
  return 10 + weatherRandom(seed, 0, 3) * 5;
}

function targets(seed: number, revision: number, kind: Weather) {
  const variation = weatherRandom(seed, revision, 4);
  return {
    wind: kind === 'storm' ? .72 + variation * .14 : kind === 'wind' ? .57 + variation * .19 : kind === 'rain' ? .27 + variation * .16 : .09,
    rain: kind === 'storm' ? .77 + variation * .2 : kind === 'rain' ? .48 + variation * .26 : 0,
    cloud: kind === 'storm' ? .97 : kind === 'rain' ? .8 : kind === 'wind' ? .43 : .12,
    risk: kind === 'storm' ? .81 + variation * .17 : kind === 'rain' ? .27 + variation * .14 : kind === 'wind' ? .16 : .02,
  };
}

export function createAtmosphere(seed: number, kind: Weather = 'clear', elapsed = 0): Atmosphere {
  const target = targets(seed, 0, kind);
  return {
    windStrength: target.wind, windAngle: weatherRandom(seed, 0, 6) * TAU,
    rainIntensity: target.rain, cloudCover: target.cloud, stormRisk: target.risk,
    lightningAt: -1, lightningPoint: null,
    nextLightningAt: kind === 'storm' ? elapsed + 5 + weatherRandom(seed, 0, 7) * 4 : 0,
    revision: 0,
  };
}

/** Starts one bounded phase. Intensities settle continuously in updateAtmosphere. */
export function setWeather(state: GameState, kind: Weather): void {
  const atmosphere = state.atmosphere;
  state.weather = kind;
  atmosphere.revision++;
  state.weatherUntil = state.elapsed + 20 + weatherRandom(state.seed, atmosphere.revision, 3) * 15;
  atmosphere.nextLightningAt = kind === 'storm' ? state.elapsed + 4 + weatherRandom(state.seed, atmosphere.revision, 7) * 4 : 0;
}

function nextWeather(state: GameState): Weather {
  const revision = state.atmosphere.revision + 1;
  const candidates = WEATHER_KINDS.filter(kind => kind !== state.weather);
  // The first change always gives the player visible wind or rain during the opening tasks.
  const pool = state.atmosphere.revision === 0 ? candidates.filter(kind => kind !== 'clear') : candidates;
  const roll = weatherRandom(state.seed, revision, 0);
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}

function ease(current: number, target: number, rate: number, dt: number): number {
  return clamp(current + (target - current) * (1 - Math.exp(-rate * dt)), 0, 1);
}

export function updateAtmosphere(state: GameState, dt: number): { changed: boolean; lightning: boolean; previous: Weather } {
  const previous = state.weather;
  const changed = state.elapsed >= state.weatherUntil;
  if (changed) setWeather(state, nextWeather(state));
  const atmosphere = state.atmosphere;
  const target = targets(state.seed, atmosphere.revision, state.weather);
  const phase = weatherRandom(state.seed, atmosphere.revision, 6) * TAU;
  const gust = Math.sin(state.elapsed * 1.21 + phase) * .075 + Math.sin(state.elapsed * .43 + phase * 2) * .055;
  atmosphere.windStrength = clamp(target.wind + gust * (state.weather === 'clear' ? .3 : 1), 0, 1);
  atmosphere.windAngle = ((phase + Math.sin(state.elapsed * .12 + phase) * .32) % TAU + TAU) % TAU;
  atmosphere.rainIntensity = ease(atmosphere.rainIntensity, target.rain, .42, dt);
  atmosphere.cloudCover = ease(atmosphere.cloudCover, target.cloud, .24, dt);
  atmosphere.stormRisk = ease(atmosphere.stormRisk, target.risk, .55, dt);
  const lightning = state.weather === 'storm' && atmosphere.nextLightningAt > 0 && state.elapsed >= atmosphere.nextLightningAt;
  if (lightning) {
    const strike = Math.round(atmosphere.nextLightningAt * 1000);
    atmosphere.lightningAt = state.elapsed;
    atmosphere.lightningPoint = {
      x: 8 + weatherRandom(state.seed, strike, 10) * 84,
      y: 18 + weatherRandom(state.seed, strike, 11) * 72,
    };
    atmosphere.nextLightningAt = state.elapsed + 8 + weatherRandom(state.seed, strike, 12) * 7;
  }
  return { changed, lightning, previous };
}

export function getWeatherSnapshot(state: GameState, npc: Npc): WeatherSnapshot {
  const { center, half } = SHELTER_COVER;
  const dx = Math.max(0, Math.abs(npc.position.x - center.x) - half.x);
  const dy = Math.max(0, Math.abs(npc.position.y - center.y) - half.y);
  const shelterDistance = Math.hypot(dx, dy);
  const exposure = shelterDistance === 0 ? 1 - .96 * state.shelterIntegrity / 100 : 1;
  return {
    kind: state.weather, windStrength: state.atmosphere.windStrength,
    rainIntensity: state.atmosphere.rainIntensity, stormRisk: state.atmosphere.stormRisk,
    wetness: npc.wetness, exposure: clamp(exposure, 0, 1),
    shelterIntegrity: state.shelterIntegrity, shelterDistance,
  };
}
