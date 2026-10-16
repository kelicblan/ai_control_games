import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { RainSurfaces } from '../src/scene/rainSurfaces';

const roof = () => {
  const mesh = new Mesh(new BoxGeometry(10, 1, 10), new MeshBasicMaterial());
  mesh.position.y = 8; mesh.userData.staticRainSurface = true;
  return mesh;
};

describe('static rain contacts', () => {
  it('reuses an exact static contact across frames and preserves contact normals', () => {
    const mesh = roof(), surfaces = new RainSurfaces([mesh], null);
    const raycast = vi.spyOn(mesh, 'raycast');
    const point = new Vector3(), normal = new Vector3();
    for (let i = 0; i < 100; i++) {
      surfaces.refresh();
      expect(surfaces.intersect(0, 0, 0, 0, point, normal)).toBe(true);
      expect(point.y).toBeCloseTo(8.5); expect(normal.toArray()).toEqual([0, 1, 0]);
      point.set(999, 999, 999); normal.set(999, 999, 999);
    }
    expect(raycast.mock.calls.length).toBe(1);
  });

  it('invalidates contacts on transforms and replacement of the loaded roof list', () => {
    const first = roof(), roofs = [first], surfaces = new RainSurfaces(roofs, null);
    const point = new Vector3(); surfaces.refresh(); surfaces.intersect(0, 0, 0, 0, point);
    first.position.y = 12; surfaces.refresh(); surfaces.intersect(0, 0, 0, 0, point);
    expect(point.y).toBeCloseTo(12.5);
    const next = roof(); next.position.y = 16; roofs.splice(0, 1, next);
    surfaces.refresh(); surfaces.intersect(0, 0, 0, 0, point);
    expect(point.y).toBeCloseTo(16.5);
  });

  it('never reuses animated cloth contacts and distinguishes rain direction', () => {
    const mesh = roof(); mesh.userData.staticRainSurface = false;
    const surfaces = new RainSurfaces([mesh], null), point = new Vector3();
    surfaces.refresh(); surfaces.intersect(0, 0, 0, 0, point);
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + 2);
    surfaces.refresh(); surfaces.intersect(0, 0, 0, 0, point);
    expect(point.y).toBeCloseTo(10.5);
    mesh.userData.staticRainSurface = true; surfaces.refresh();
    expect(surfaces.intersect(0, 0, 0, 0, point)).toBe(true);
    expect(surfaces.intersect(0, 0, 1, 0, point)).toBe(false);
  });
});
