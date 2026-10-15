/** At 1x speed: seven minutes of daylight, three minutes of night, starting at dawn. */
export const CAMP_DAYLIGHT_SECONDS = 420;
export const CAMP_NIGHT_SECONDS = 180;
export const CAMP_DAY_SECONDS = CAMP_DAYLIGHT_SECONDS + CAMP_NIGHT_SECONDS;
/** Finite timer ceiling leaves ample precision for deterministic quarter-second steps. */
export const MAX_SIMULATION_TIME = 1_000_000_000_000;
export type CampPeriod = 'morning' | 'noon' | 'afternoon' | 'night';
export const CAMP_PERIOD_LABELS: Record<CampPeriod, string> = { morning: '早上', noon: '中午', afternoon: '下午', night: '晚上' };

export function getCampClock(elapsed: number) {
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const cycle = safeElapsed % CAMP_DAY_SECONDS;
  const isNight = cycle >= CAMP_DAYLIGHT_SECONDS;
  // Both clock halves cover twelve displayed hours, at different real-time rates.
  const clockMinutes = isNight ? 18 * 60 + (cycle - CAMP_DAYLIGHT_SECONDS) / CAMP_NIGHT_SECONDS * 720
    : 6 * 60 + cycle / CAMP_DAYLIGHT_SECONDS * 720;
  const minutes = Math.floor(clockMinutes % 1440);
  const period: CampPeriod = isNight ? 'night' : minutes < 600 ? 'morning' : minutes < 840 ? 'noon' : 'afternoon';
  const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  // Start fully lit; short twilight transitions keep the visual change continuous.
  const daylight = isNight ? .05 + .95 * smooth((cycle - 580) / 20)
    : 1 - .95 * smooth((cycle - 400) / 20);
  return { day: 1 + Math.floor(safeElapsed / CAMP_DAY_SECONDS), minutes,
    phase: (clockMinutes % 1440) / 1440, daylight, isNight, period };
}
