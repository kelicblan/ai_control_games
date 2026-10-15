import { describe, expect, it } from 'vitest';
import { CAMP_DAY_SECONDS, getCampClock } from '../src/games/camp/simulation/clock';

describe('shared camp calendar', () => {
  it('labels morning, noon, afternoon and evening from the same displayed clock', () => {
    for (const [elapsed, period] of [[0, 'morning'], [140, 'noon'], [280, 'afternoon'], [420, 'night'], [510, 'night'], [600, 'morning']] as const) {
      expect(getCampClock(elapsed)).toMatchObject({ period });
    }
  });
  it('starts in daylight and cycles seven minutes of day plus three minutes of night', () => {
    expect(CAMP_DAY_SECONDS).toBe(600);
    expect(getCampClock(0)).toMatchObject({ day: 1, minutes: 6 * 60, isNight: false });
    expect(getCampClock(0).daylight).toBeGreaterThan(.9);
    expect(getCampClock(419.999)).toMatchObject({ day: 1, isNight: false });
    expect(getCampClock(420)).toMatchObject({ day: 1, minutes: 18 * 60, isNight: true });
    expect(getCampClock(599.999)).toMatchObject({ day: 1, isNight: true });
    expect(getCampClock(600)).toEqual({ ...getCampClock(0), day: 2 });
    expect(getCampClock(1020)).toMatchObject({ day: 2, isNight: true });
  });

  it('cycles daylight and night at the same times on every day', () => {
    for (const elapsed of [0, 60, 210, 419, 420, 500, 599]) {
      const clock = getCampClock(elapsed), tomorrow = getCampClock(elapsed + CAMP_DAY_SECONDS);
      expect(tomorrow).toEqual({ ...clock, day: clock.day + 1 });
      expect(clock.daylight).toBeGreaterThanOrEqual(0);
      expect(clock.daylight).toBeLessThanOrEqual(1);
    }
    expect(getCampClock(500).daylight).toBeLessThan(.1);
    expect(getCampClock(210).daylight).toBeGreaterThan(.9);
  });

  it('returns finite render values for malformed inputs', () => {
    for (const elapsed of [-1, Infinity, NaN]) expect(getCampClock(elapsed)).toEqual(getCampClock(0));
  });
});
