import { CAMP_DAYLIGHT_SECONDS, CAMP_DAY_SECONDS, getCampClock } from '../games/camp/simulation/clock';

/** Shared solar profile: cloud cover softens sunlight without turning daytime into night. */
export function getCampLighting(elapsed: number, cloudCover: number, flash = 0) {
  const clock = getCampClock(elapsed), day = clock.daylight;
  const cloud = Number.isFinite(cloudCover) ? Math.max(0, Math.min(1, cloudCover)) : 0;
  const safeTime = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const progress = Math.min(1, (safeTime % CAMP_DAY_SECONDS) / CAMP_DAYLIGHT_SECONDS);
  return {
    sun: (.55 + day * 4.4) * (1 - cloud * .4) + flash * 2.1,
    ambient: 1.65 + day * (1.15 + cloud * .35) + flash * .6,
    fill: .65 + day * .4,
    exposure: 1.2 + day * .28 - cloud * day * .05 + flash * .07,
    offset: { x: -100 * Math.cos(progress * Math.PI), y: 45 + 80 * Math.sin(progress * Math.PI), z: 65 },
  };
}
