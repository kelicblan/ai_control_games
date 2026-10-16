import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { fitSettlementModel } from '../src/scene/settlementHomes';

function roof() {
  const source = new Group();
  const geometry = new PlaneGeometry(20, 20, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, 4 - Math.abs(position.getX(i)) * .2);
  source.add(new Mesh(geometry, new MeshBasicMaterial()));
  return fitSettlementModel(source, { id: 'roof', center: { x: 50, y: 50 }, half: { x: 10, y: 10 }, height: 6, base: 0 });
}

describe('static building ray queries', () => {
  it('prunes dense roof triangles instead of reading every vertex for each raindrop', () => {
    const model = roof(); model.updateMatrixWorld(true);
    const mesh = model.children[0] as Mesh;
    const vertices = vi.spyOn(mesh, 'getVertexPosition');
    const ray = Object.assign(new Raycaster(new Vector3(1, 20, 1), new Vector3(0, -1, 0)), { firstHitOnly: true });
    expect(ray.intersectObject(model, true)[0]?.point.y).toBeGreaterThan(0);
    expect(vertices.mock.calls.length).toBeLessThan(300);
    vertices.mockRestore();
  });

  it('retains source topology and matches ordinary raycasting after world-origin translation', () => {
    const model = roof(), mesh = model.children[0] as Mesh;
    const indices = Array.from(mesh.geometry.index!.array);
    model.position.set(-1024, 3, -2048); model.updateMatrixWorld(true);
    const ray = Object.assign(new Raycaster(), { firstHitOnly: true });
    for (const x of [-15, -7, 0, 5, 15]) {
      ray.set(new Vector3(x - 1024, 30, 2 - 2048), new Vector3(.03, -1, .02).normalize());
      const accelerated = ray.intersectObject(mesh)[0];
      const fast = mesh.raycast; mesh.raycast = Mesh.prototype.raycast;
      const reference = ray.intersectObject(mesh)[0]; mesh.raycast = fast;
      expect(!!accelerated).toBe(!!reference);
      if (reference) {
        expect(accelerated.point.distanceTo(reference.point)).toBeLessThan(1e-6);
        expect(accelerated.face!.normal.distanceTo(reference.face!.normal)).toBeLessThan(1e-6);
      }
    }
    expect(Array.from(mesh.geometry.index!.array)).toEqual(indices);
  });
});
