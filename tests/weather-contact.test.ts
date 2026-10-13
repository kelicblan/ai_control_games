import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BufferGeometry, InstancedMesh, Material, Matrix3, Matrix4, Mesh, Points, Raycaster, Vector3 } from 'three';
import { createGame } from '../src/games/camp/simulation/engine';
import { createEnvironment } from '../src/scene/environment';
import { seeded, Shapes } from '../src/scene/geometry';
import { createWeatherEffects } from '../src/scene/weather';

let shapes: Shapes;
let environment: ReturnType<typeof createEnvironment>;
let effects: ReturnType<typeof createWeatherEffects>;
let roofs: Mesh[];
const matrix = new Matrix4(), normalMatrix = new Matrix3(), ray = new Raycaster();
const down = new Vector3(0, -1, 0), up = new Vector3(0, 1, 0);
const random = seeded(3321), seeds = Array.from({ length: 480 }, () => [random(), random(), random(), random()]);

beforeAll(() => {
  shapes = new Shapes(); environment = createEnvironment(shapes);
  effects = createWeatherEffects(environment.rainSurfaces);
  roofs = ['Rest shelter canvas awning', 'Pitched canvas with pinned ridge and seams']
    .map(name => environment.group.getObjectByName(name) as Mesh);
});

afterAll(() => {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  for (const group of [environment.group, effects.group]) group.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
    if (mesh.customDistanceMaterial) materials.add(mesh.customDistanceMaterial);
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); shapes.dispose();
});

function update(time: number, integrity: number, reducedMotion = false) {
  const game = createGame({ seed: 17 });
  Object.assign(game.atmosphere, { rainIntensity: 1, windStrength: .85, windAngle: .7 });
  game.shelterIntegrity = integrity;
  environment.update(time, game, reducedMotion);
  effects.update(time, game, reducedMotion);
  environment.group.updateMatrixWorld(true);
  // The oracle intersects the actual displayed triangles independently of the contact sampler.
  for (const roof of roofs) { roof.geometry.computeBoundingBox(); roof.geometry.computeBoundingSphere(); }
  return game;
}

describe('rain contacts on moving canvas', () => {
  it.each([100, 25])('places rings on the actual roof at shelter integrity %s', integrity => {
    const splashes = effects.group.getObjectByName('Rain rings on earth and water') as InstancedMesh;
    for (const time of [12.3, 12.55, 12.6, 12.8, 14]) {
      update(time, integrity);
      for (let i = 0; i < 24; i++) {
        splashes.getMatrixAt(i, matrix);
        const center = new Vector3().setFromMatrixPosition(matrix);
        ray.set(new Vector3(center.x, 32, center.z), down);
        const hit = ray.intersectObject(roofs[0])[0];
        expect(hit, `roof ring ${i} at ${time}`).toBeDefined();
        expect(center.y - hit.point.y).toBeGreaterThanOrEqual(-.002);
        expect(center.y - hit.point.y).toBeLessThan(.035);
        const roofNormal = hit.face!.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
        const ringNormal = up.clone().transformDirection(matrix);
        expect(ringNormal.dot(roofNormal)).toBeGreaterThan(.99);
      }
    }
  });

  it('clips slanted rain against deformed roofs, including when canvas rises', () => {
    const rain = effects.group.getObjectByName('Slanted rain') as Mesh;
    const top = rain.geometry.getAttribute('streakTop'), bottom = rain.geometry.getAttribute('streakBottom');
    const direction = new Vector3(Math.cos(.7) * .85 * .22, -1, Math.sin(.7) * .85 * .22);
    const leanX = direction.x, leanZ = direction.z; direction.normalize();
    let contacts = 0;
    for (let step = 0; step < 32; step++) {
      update(12 + step * .1, 100);
      for (let i = 0; i < top.count; i++) {
        const anchorX = top.getX(i) + leanX * top.getY(i), anchorZ = top.getZ(i) + leanZ * top.getY(i);
        ray.set(new Vector3(anchorX - leanX * 32, 32, anchorZ - leanZ * 32), direction);
        const hit = ray.intersectObjects(roofs, false)[0];
        if (!hit) continue;
        const clearance = bottom.getY(i) - hit.point.y;
        expect(clearance).toBeGreaterThanOrEqual(-.002);
        if (clearance < .025) contacts++;
      }
    }
    expect(contacts).toBeGreaterThanOrEqual(5);
  });

  it('starts runoff on the current awning edge and replays it after a pause or seek', () => {
    const runoff = effects.group.getObjectByName('Awning roof runoff') as Mesh;
    const top = runoff.geometry.getAttribute('streakTop');
    const index = 10, [sx, , phase, rate] = seeds[index + 90];
    const time = (20 - phase + .00001) / (.85 + rate * .4);
    update(time, 25);
    const awning = roofs[0], position = awning.geometry.getAttribute('position'), uv = awning.geometry.getAttribute('uv');
    const edge = Array.from({ length: position.count }, (_, i) => i).filter(i => uv.getY(i) < .0001)
      .sort((a, b) => uv.getX(a) - uv.getX(b));
    const scaled = sx * (edge.length - 1), left = Math.floor(scaled), right = Math.min(edge.length - 1, left + 1);
    const source = new Vector3().fromBufferAttribute(position, edge[left])
      .lerp(new Vector3().fromBufferAttribute(position, edge[right]), scaled - left).applyMatrix4(awning.matrixWorld);
    const head = new Vector3().fromBufferAttribute(top, index);
    expect(head.distanceTo(source)).toBeLessThan(.03);
    const rain = effects.group.getObjectByName('Slanted rain') as Mesh;
    const rings = effects.group.getObjectByName('Rain rings on earth and water') as InstancedMesh;
    const spray = effects.group.getObjectByName('Fine rain contact droplets') as Points;
    const frame = () => [
      ...[rain, runoff].flatMap(mesh => ['streakTop', 'streakBottom'].map(name => Array.from(mesh.geometry.getAttribute(name).array))),
      Array.from(rings.instanceMatrix.array), Array.from(rings.geometry.getAttribute('splashAge').array),
      Array.from(spray.geometry.getAttribute('position').array), Array.from(spray.geometry.getAttribute('dropletAge').array),
    ];
    const before = frame();
    update(time + .5, 25); update(time, 25);
    expect(frame()).toEqual(before);
    update(time, 25, true); const still = frame();
    update(time + 9, 25, true);
    expect(frame()).toEqual(still);
    expect(rings.visible).toBe(false); expect(spray.visible).toBe(false);
  });

  it('emits the fine droplets from the deformed roof contact', () => {
    const spray = effects.group.getObjectByName('Fine rain contact droplets') as Points;
    const position = spray.geometry.getAttribute('position');
    for (const index of [7, 23]) {
      const [, , phase, rate] = seeds[index + 30];
      const time = (20 - phase + .00001) / (1.45 + rate * .45);
      update(time, 25);
      for (const droplet of [index * 2, index * 2 + 1]) {
        const start = new Vector3().fromBufferAttribute(position, droplet);
        ray.set(new Vector3(start.x, 32, start.z), down);
        const hit = ray.intersectObject(roofs[0])[0];
        expect(hit).toBeDefined();
        expect(start.y - hit.point.y).toBeGreaterThanOrEqual(0);
        expect(start.y - hit.point.y).toBeLessThan(.035);
      }
    }
  });
});
