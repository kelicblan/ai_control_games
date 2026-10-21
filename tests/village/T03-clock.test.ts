import { describe, expect, it } from 'vitest';
import { getCampClock } from '../../src/games/camp/simulation/clock';
import { readVillageClock, dueVillageWaves } from '../../src/games/camp/village/domain/clock';
import { selectWorldRules } from '../../src/games/camp/village/config/load';

const rules = { daylightSeconds: 480, nightSeconds: 240 };
describe('T03 independent village clock and pinned rules', () => {
  it('uses 480/240 only for the explicit new mode', () => {
    expect(readVillageClock(479.9, rules)).toMatchObject({ day: 1, isNight: false });
    expect(readVillageClock(480, rules)).toMatchObject({ day: 1, isNight: true, phaseSeconds: 0 });
    expect(readVillageClock(720, rules)).toMatchObject({ day: 2, isNight: false, phaseSeconds: 0 });
    expect(readVillageClock(3360, rules)).toMatchObject({ day: 5, isNight: true });
    expect(getCampClock(420).isNight).toBe(true);
    expect(getCampClock(600).day).toBe(2);
    expect(getCampClock(720).day).toBe(2);
  });

  it('rejects invalid time or clock parameters without clamping corrupt saves', () => {
    for (const time of [-1, NaN, Infinity, 1e13]) expect(() => readVillageClock(time, rules)).toThrow();
    for (const clock of [{ daylightSeconds: 0, nightSeconds: 240 }, { daylightSeconds: 480, nightSeconds: NaN }]) {
      expect(() => readVillageClock(1, clock)).toThrow();
    }
    expect(() => dueVillageWaves(10, 9, selectWorldRules('village-v1', 'draft-table-v1'), [])).toThrow();
  });

  it('uses relative twilight endpoints and preserves every old visual clock sample', () => {
    const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
    for (let t = 0; t < 600; t += .5) {
      expect(getCampClock(t).daylight).toBe(t >= 420 ? .05 + .95 * smooth((t - 580) / 20) : 1 - .95 * smooth((t - 400) / 20));
    }
    expect(readVillageClock(480, rules).daylight).toBeCloseTo(.05);
    expect(readVillageClock(719.999, rules).daylight).toBeCloseTo(1, 7);
    expect(readVillageClock(720, rules).daylight).toBe(1);
  });

  it('pins rule versions, rejects unknown modes and does not silently upgrade an old world', () => {
    expect(selectWorldRules()).toMatchObject({ worldMode: 'legacy', ruleVersion: 'legacy-v3', clock: { daylightSeconds: 420, nightSeconds: 180 } });
    expect(selectWorldRules('village-v1', 'draft-table-v1')).toMatchObject({ worldMode: 'village-v1', clock: rules });
    expect(() => selectWorldRules('village-v1')).toThrow(/version|版本/);
    expect(() => selectWorldRules('legacy', 'draft-table-v1')).toThrow();
    expect(() => selectWorldRules('village-v1', 'release-v1')).toThrow();
    expect(() => selectWorldRules('unknown', 'draft-table-v1')).toThrow();
    expect(Object.isFrozen(selectWorldRules('village-v1', 'draft-table-v1').clock)).toBe(true);
  });

  it('crosses day-five night exactly once and catches each due wave after a time jump', () => {
    const compiled = selectWorldRules('village-v1', 'draft-table-v1');
    expect(dueVillageWaves(0, 3359.9, compiled, [])).toEqual([]);
    expect(dueVillageWaves(3359.9, 3360, compiled, [])).toEqual([{ waveId: 1, atSeconds: 3360 }]);
    expect(dueVillageWaves(0, 3360, compiled, [1])).toEqual([]);
    expect(dueVillageWaves(3360, 3361, compiled, [])).toEqual([]);
    expect(dueVillageWaves(0, 30000, compiled, []).map(w => w.waveId)).toEqual([1, 2, 3]);
  });
});
