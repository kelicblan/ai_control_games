import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { configureCamera, defaultOrbit, projectWorld, groundFromScreen } from '../src/scene/camera';

describe('camp camera and ground selection', () => {
  for (const [width, height] of [[390, 844], [844, 390], [1536, 1024]]) {
    it(`shows the central fire and resolves taps to the same ground point at ${width}×${height}`, () => {
      const camera = new OrthographicCamera();
      configureCamera(camera, width, height, defaultOrbit());
      const fire = projectWorld(camera, new Vector3(1, 0, 4), width, height);
      expect(fire.visible).toBe(true);
      expect(fire.x).toBeGreaterThan(width * .25);
      expect(fire.x).toBeLessThan(width * .75);
      for (const point of [{ x: 51, y: 60.2 }, { x: 32, y: 72 }, { x: 71, y: 73.2 }]) {
        const pixel = projectWorld(camera, new Vector3(point.x - 50, 0, point.y - 50), width, height);
        const picked = groundFromScreen(camera, pixel.x, pixel.y, width, height);
        expect(picked?.x).toBeCloseTo(point.x, 5);
        expect(picked?.y).toBeCloseTo(point.y, 5);
      }
    });
  }
  it('preserves picking after rotating and zooming the world', () => {
    const camera = new OrthographicCamera();
    const orbit = { ...defaultOrbit(), azimuth: -.7, elevation: .9, zoom: 1.55 };
    configureCamera(camera, 390, 844, orbit);
    const pixel = projectWorld(camera, new Vector3(7, 0, 9), 390, 844);
    const picked = groundFromScreen(camera, pixel.x, pixel.y, 390, 844);
    expect(picked?.x).toBeCloseTo(57, 5);
    expect(picked?.y).toBeCloseTo(59, 5);
  });
});
