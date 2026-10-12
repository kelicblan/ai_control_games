import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, PointLight, Points, Vector3 } from 'three';
import { createGame } from '../src/game/engine';
import { TERRAIN } from '../src/game/terrain';
import { createEnvironment, type CampEnvironment } from '../src/scene/environment';
import { Shapes } from '../src/scene/geometry';

const matrix = new Matrix4();
const creek = TERRAIN.find(object => object.kind === 'water')!.shape;
if (creek.type !== 'aabb') throw new Error('The creek needs its shared rectangular footprint');
const creekX = creek.center.x - 50;
let environment: CampEnvironment;
let shapes: Shapes;

function foamPositions() {
  const foam = environment.group.getObjectByName('Flowing creek ripples') as InstancedMesh;
  return Array.from({ length: foam.count }, (_, index) => {
    foam.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  });
}

beforeAll(() => { shapes = new Shapes(); environment = createEnvironment(shapes); });
afterAll(() => {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  environment.group.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(mat);
    if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
    if (mesh.customDistanceMaterial) materials.add(mesh.customDistanceMaterial);
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); shapes.dispose();
});

describe('visible environment physics', () => {
  it('advects actual river foam downstream faster in the channel than at either bank', () => {
    const game = createGame({ seed: 19 });
    game.atmosphere.windStrength = 1;
    game.atmosphere.windAngle = -Math.PI / 2;
    environment.update(12, game, false);
    const before = foamPositions();
    environment.update(13, game, false);
    const after = foamPositions();
    const moving = before.map((point, index) => ({ x: Math.abs(point.x - creekX), dz: after[index].z - point.z }))
      .filter(particle => particle.dz > -1); // A finite river recycles foam only beyond its distant end.
    expect(moving.every(particle => particle.dz > 0)).toBe(true);
    const middle = moving.filter(particle => particle.x < creek.half.x * .25);
    const banks = moving.filter(particle => particle.x > creek.half.x * .7);
    expect(middle.length).toBeGreaterThan(0); expect(banks.length).toBeGreaterThan(0);
    const mean = (particles: typeof moving) => particles.reduce((sum, particle) => sum + particle.dz, 0) / particles.length;
    expect(mean(middle)).toBeGreaterThan(mean(banks) * 1.45);
  });

  it('reconstructs the same water and cloth phase after pause, seek and reduced motion', () => {
    const game = createGame({ seed: 19 });
    environment.update(14, game, false);
    const initial = foamPositions();
    environment.update(80, game, false);
    environment.update(14, { ...game, status: 'paused' }, false);
    expect(foamPositions()).toEqual(initial);
    const cloth = environment.group.getObjectByName('Rest shelter canvas awning') as Mesh;
    environment.update(14, game, true);
    const stillFoam = foamPositions(), stillCloth = Array.from(cloth.geometry.getAttribute('position').array);
    environment.update(25, game, true);
    expect(foamPositions()).toEqual(stillFoam);
    expect(Array.from(cloth.geometry.getAttribute('position').array)).toEqual(stillCloth);
  });

  it('carries a rising smoke plume downwind and dims the fire when fuel runs low', () => {
    const game = createGame({ seed: 19 });
    game.fire = 100; game.atmosphere.windStrength = .85; game.atmosphere.windAngle = 0;
    environment.update(8, game, false);
    const smoke = environment.group.getObjectByName('Wind carried campfire smoke') as Points | undefined;
    expect(smoke).toBeDefined();
    const smokePositions = smoke!.geometry.getAttribute('position');
    const fullPlumeHeight = Math.max(...Array.from({ length: smokePositions.count }, (_, i) => smokePositions.getY(i)));
    const east = Array.from({ length: smokePositions.count }, (_, i) => smokePositions.getX(i));
    game.atmosphere.windAngle = Math.PI;
    environment.update(8, game, false);
    const west = Array.from({ length: smokePositions.count }, (_, i) => smokePositions.getX(i));
    expect(east.some((x, i) => x - west[i] > 2)).toBe(true);
    const light = environment.group.children.find(object => object instanceof PointLight) as PointLight;
    const bright = light.intensity;
    game.fire = 4;
    environment.update(8, game, false);
    expect(light.intensity).toBeLessThan(bright * .1);
    expect(Math.max(...Array.from({ length: smokePositions.count }, (_, i) => smokePositions.getY(i)))).toBeLessThan(fullPlumeHeight);
    game.fire = 0;
    environment.update(8, game, false);
    expect(light.intensity).toBe(0); expect(smoke!.visible).toBe(false);
  });
});
