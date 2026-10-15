import { describe, expect, it } from 'vitest';
import { advanceVisualTime } from '../src/scene/visualClock';

describe('animation between world snapshots', () => {
  it('continues short weather motion between 250ms snapshot arrivals', () => {
    let time = 100;
    for (let i = 0; i < 16; i++) time = advanceVisualTime(time, 100, .016, 1);
    expect(time).toBeCloseTo(100.256);
    for (let i = 0; i < 100; i++) time = advanceVisualTime(time, 100, .016, 1);
    expect(time).toBeCloseTo(100.35);
  });
  it('scales the short presentation window with game speed', () => {
    expect(advanceVisualTime(100, 100, .1, 4)).toBeCloseTo(100.4);
  });
});
