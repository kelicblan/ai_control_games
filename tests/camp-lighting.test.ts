import { describe, expect, it } from 'vitest';
import { getCampLighting } from '../src/scene/lighting';

describe('camp sunlight', () => {
  it('keeps a bright day distinct from night even in heavy cloud', () => {
    const day = getCampLighting(210, 0), overcast = getCampLighting(210, 1), night = getCampLighting(500, 0);
    expect(day.sun).toBeGreaterThan(4);
    expect(day.exposure).toBeGreaterThan(1.2);
    expect(overcast.ambient).toBeGreaterThan(1.3);
    expect(overcast.exposure).toBeGreaterThan(1.1);
    expect(night.sun).toBeLessThan(.8);
    expect(night.ambient).toBeGreaterThanOrEqual(1.6);
    expect(night.exposure).toBeGreaterThanOrEqual(1.1);
    expect(day.ambient).toBeGreaterThan(night.ambient*1.5);
    expect(day.sun / day.ambient).toBeGreaterThan(1.7);
    expect(overcast.sun).toBeGreaterThan(2.5);
  });
  it('moves the sun from east to west and repeats at the next dawn', () => {
    const morning = getCampLighting(0, 0), noon = getCampLighting(210, 0), afternoon = getCampLighting(390, 0);
    expect(morning.offset.x).toBeLessThan(0);
    expect(afternoon.offset.x).toBeGreaterThan(0);
    expect(noon.offset.y).toBeGreaterThan(morning.offset.y);
    expect(getCampLighting(600, 0)).toEqual(morning);
  });
});
