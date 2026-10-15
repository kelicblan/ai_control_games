import { describe, expect, it } from 'vitest';
import { scenePixelRatio,nextSceneQuality } from '../src/scene/renderBudget';

describe('desktop render resolution', () => {
  it('bounds the GPU pixel load at screenshot size even on a high DPI screen', () => {
    const ratio = scenePixelRatio(1920, 920, 1.75);
    expect(1920 * 920 * ratio * ratio).toBeLessThanOrEqual(1_800_001);
    expect(ratio).toBeGreaterThanOrEqual(1);
  });
  it('adapts to resizing and never upscales a normal DPI small window', () => {
    expect(scenePixelRatio(1280, 720, 1)).toBe(1);
    expect(scenePixelRatio(3840, 2160, 2)).toBeLessThan(.5);
  });
  it('reduces persistent low frame-rate load within a bound and recovers gradually',()=>{
    let quality=1;for(let i=0;i<20;i++)quality=nextSceneQuality(quality,15);
    expect(quality).toBe(.65);expect(nextSceneQuality(quality,40)).toBe(.65);
    expect(nextSceneQuality(quality,58)).toBeCloseTo(.7);expect(nextSceneQuality(1,58)).toBe(1);
  });
});
