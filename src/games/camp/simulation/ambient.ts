import { clamp, distance, LOCATIONS } from './constants';
import { TERRAIN } from './terrain';
import {validPoint} from '../../../../packages/world-core/src';
import {riverCenter,riverHalfWidth} from '../world/definition';
import type { Atmosphere, Point } from './types';

export type AmbientKind = 'wind' | 'leaves' | 'rain' | 'water' | 'fire';
export type TextureKind = AmbientKind | 'thunderBody' | 'thunderCrack';
export const AMBIENT_SAMPLE_RATE = 16_000;
export const AMBIENT_KINDS: readonly AmbientKind[] = ['wind', 'leaves', 'rain', 'water', 'fire'];

export interface AudioEnvironment {
  /** Remaining fire strength, in the simulation's 0–100 range. */
  fire: number;
  /** The selected character is the listening position, in game map coordinates. */
  listener: Point;
  seed?: number;
  timeScale?: number;
  /** Ground-plane screen-right vector. Omitting it uses world +X. */
  listenerRight?: Point;
}

export interface AmbientMix {
  gain: number;
  pan: number;
  frequency: number;
  playbackRate: number;
}

export interface ThunderMix {
  delay: number;
  gain: number;
  pan: number;
  distance: number;
  duration: number;
  variation: number;
}

const TAU = Math.PI * 2;
const creek = TERRAIN.find(object => object.kind === 'water');

function safePoint(point: Point | undefined, fallback: Point): Point {
  return point&&validPoint(point)?{...point}:{...fallback};
}

function listenerFrame(environment?: AudioEnvironment) {
  const listener = safePoint(environment?.listener, LOCATIONS.camp);
  const right = environment?.listenerRight;
  const length = right ? Math.hypot(right.x, right.y) : 0;
  return { listener, right: Number.isFinite(length) && length > .001
    ? { x: right!.x / length, y: right!.y / length } : { x: 1, y: 0 } };
}

function panTo(source: Point, listener: Point, right: Point) {
  return clamp(((source.x - listener.x) * right.x + (source.y - listener.y) * right.y)
    / Math.max(14, distance(source, listener)) * .8, -.85, .85);
}

/** Sound and collision use the same creek footprint, including its off-map continuation. */
function nearestWater(listener: Point): Point {
  if (!creek) return listener;
  const center=riverCenter(listener.y),width=riverHalfWidth(listener.y);
  return {x:clamp(listener.x,center-width,center+width),y:listener.y};
}

/** Only presentation reads these values; synthesis never changes the world's random stream. */
export function environmentalMix(atmosphere: Atmosphere, elapsed: number, environment?: AudioEnvironment): Record<AmbientKind, AmbientMix> {
  const wind = clamp(atmosphere.windStrength, 0, 1), rain = clamp(atmosphere.rainIntensity, 0, 1);
  const fire = clamp(environment?.fire ?? 0) / 100;
  const { listener, right } = listenerFrame(environment);
  const angle = Number.isFinite(atmosphere.windAngle) ? atmosphere.windAngle : 0;
  // The air is heard from the upwind side; the same vector carries leaves and rain downwind.
  const windPan = -(Math.cos(angle) * right.x + Math.sin(angle) * right.y) * .48;
  const time = Number.isFinite(elapsed) ? elapsed : 0;
  const breath = .91 + Math.sin(time * .47) * .055 + Math.sin(time * .83 + .7) * .035;
  const water = nearestWater(listener);
  const creekLevel = creek ? 1 / (1 + (distance(water, listener) / 22) ** 1.4) : 0;
  const fireLevel = 1 / (1 + (distance(LOCATIONS.fire, listener) / 14) ** 1.7);
  return {
    wind: { gain: .72 * wind ** 1.12 * breath, pan: windPan, frequency: 580 + wind * 1100, playbackRate: .88 + wind * .2 },
    leaves: { gain: .45 * wind ** 1.35 * breath, pan: windPan * .75, frequency: 1450 + wind * 1550, playbackRate: .9 + wind * .18 },
    rain: { gain: .65 * rain ** .9, pan: windPan * .3, frequency: 650 + rain * 550, playbackRate: .93 + rain * .1 },
    water: { gain: .68 * creekLevel * (.85 + rain * .2 + wind * .035), pan: panTo(water, listener, right), frequency: 2900 + rain * 900, playbackRate: .94 + rain * .11 },
    fire: { gain: .9 * fire ** .8 * fireLevel * (1 + wind * .18) * (1 - rain * .32), pan: panTo(LOCATIONS.fire, listener, right), frequency: 110 + (1 - fire) * 180, playbackRate: .87 + fire * .24 + wind * .06 },
  };
}

// Acoustic scale for this deliberately miniature world: the 100-unit map represents
// a 300 m woodland sound field. Geometry stays in map units; thunder alone converts
// distance to metres and uses sound travel at 343 m/s, rather than a random delay.
export const THUNDER_METRES_PER_MAP_UNIT = 3;
export const SOUND_METRES_PER_SECOND = 343;

export function thunderMix(atmosphere: Atmosphere, elapsed: number, environment?: AudioEnvironment): ThunderMix | null {
  if (!atmosphere.lightningPoint || !Number.isFinite(atmosphere.lightningAt) || atmosphere.lightningAt < 0) return null;
  const { listener, right } = listenerFrame(environment);
  const point = safePoint(atmosphere.lightningPoint, listener);
  const separation = distance(point, listener);
  const travel = separation * THUNDER_METRES_PER_MAP_UNIT / SOUND_METRES_PER_SECOND;
  const age = elapsed - atmosphere.lightningAt;
  // One simulation delivery interval at 4× is .4 s. Anything older than this grace
  // period after sound arrival is a historical snapshot, not a fresh sound event.
  if (!Number.isFinite(age) || age < 0 || age > travel + .45) return null;
  const scale = clamp(environment?.timeScale ?? 1, .25, 4);
  const variation = ((Math.imul(Math.round(atmosphere.lightningAt * 1000) ^ (environment?.seed ?? 0), 1664525) >>> 0) % 1000) / 1000;
  return {
    delay: Math.max(0, travel - age) / scale,
    gain: 1.05 / (1 + separation / 80),
    pan: panTo(point, listener, right),
    distance: separation,
    duration: 2.8 + Math.min(1.5, separation * .016),
    variation,
  };
}

/** Small, independent, reusable procedural recordings. No per-frame sample generation. */
export function createEnvironmentSamples(kind: TextureKind): Float32Array {
  const seconds = kind === 'thunderBody' ? 6 : kind === 'thunderCrack' ? 1 : 4;
  const length = Math.round(AMBIENT_SAMPLE_RATE * seconds);
  const seam = Math.round(AMBIENT_SAMPLE_RATE * .12);
  const raw = new Float32Array(length + seam);
  let seed = 73471 + ['wind', 'leaves', 'rain', 'water', 'fire', 'thunderBody', 'thunderCrack'].indexOf(kind) * 9187;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let low = 0, body = 0, pop = 0, bubble = 0, bubbleFrequency = 700, bubblePhase = 0;
  for (let i = 0; i < raw.length; i++) {
    const time = i / AMBIENT_SAMPLE_RATE;
    const white = random() * 2 - 1;
    low = low * .86 + white * .14;
    body = body * .986 + white * .055;
    let value = 0;
    if (kind === 'wind') {
      value = (body * .8 + low * .3) * (.73 + Math.sin(time * 2.1) * .13 + Math.sin(time * 3.7 + 1) * .09);
    } else if (kind === 'leaves') {
      const rustle = Math.max(.08, .5 + Math.sin(time * 10.7) * .22 + Math.sin(time * 27.3 + .8) * .16);
      value = (white - low) * rustle;
    } else if (kind === 'rain') {
      if (random() < 42 / AMBIENT_SAMPLE_RATE) pop = .3 + random() * .7;
      pop *= .95;
      value = white * (.38 + pop * .45) + low * .3;
    } else if (kind === 'water') {
      if (random() < 22 / AMBIENT_SAMPLE_RATE) { bubble = .35 + random() * .65; bubbleFrequency = 430 + random() * 1150; }
      bubble *= .997;
      bubbleFrequency *= 1.00009;
      bubblePhase += TAU * bubbleFrequency / AMBIENT_SAMPLE_RATE;
      value = body * .6 + low * .18 + Math.sin(bubblePhase) * bubble * .2;
    } else if (kind === 'fire') {
      if (random() < 13 / AMBIENT_SAMPLE_RATE) pop = .25 + random() * .75;
      pop *= .983;
      value = body * .13 + white * (.014 + pop * .73);
    } else if (kind === 'thunderBody') {
      const roll = .68 + Math.sin(time * 7.3) * .2 + Math.sin(time * 13.9 + 1.3) * .1;
      value = (body * .8 + low * .32) * roll;
    } else {
      value = (white * .72 + low * .35) * (.78 + Math.sin(time * 53) * .2);
    }
    raw[i] = value;
  }
  const result = raw.slice(0, length);
  if (kind !== 'thunderBody' && kind !== 'thunderCrack') {
    // Crossfade the continuation into the loop's beginning. The boundary follows
    // consecutive generated samples, so repeating a texture cannot add a click.
    for (let i = 0; i < seam; i++) {
      const amount = i / seam;
      result[i] = raw[i] * amount + raw[length + i] * (1 - amount);
    }
  }
  let peak = 0;
  for (const value of result) peak = Math.max(peak, Math.abs(value));
  const normalise = peak > 0 ? .9 / peak : 0;
  for (let i = 0; i < result.length; i++) result[i] *= normalise;
  return result;
}
