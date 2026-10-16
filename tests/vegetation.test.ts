import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BufferGeometry, Material, Mesh, ShaderLib } from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { createGame } from '../src/games/camp/simulation/engine';
import { TERRAIN } from '../src/games/camp/simulation/campTerrain';
import { Shapes } from '../src/scene/geometry';
import { createWoodlandVegetation } from '../src/scene/vegetation';

const creek = TERRAIN.find(object => object.kind === 'water')!.shape;
const pathDistance = (x: number, _y: number) => Math.abs(x - 50);
const insideObject = (point: { x: number; y: number }, margin = 0) => TERRAIN.some(({ shape }) => shape.type === 'circle'
  ? Math.hypot(point.x - shape.center.x, point.y - shape.center.y) < shape.radius + margin
  : Math.abs(point.x - shape.center.x) < shape.half.x + margin && Math.abs(point.y - shape.center.y) < shape.half.y + margin);
let shapes: Shapes;
let vegetation: ReturnType<typeof createWoodlandVegetation>;
let meshes: Mesh[];

function compiledUniforms(material: Material, source: keyof typeof ShaderLib = 'standard') {
  const shader = { ...ShaderLib[source], uniforms: { ...ShaderLib[source].uniforms } };
  material.onBeforeCompile(shader as WebGLProgramParametersWithUniforms, {} as WebGLRenderer);
  return shader.uniforms;
}

beforeAll(() => {
  shapes = new Shapes();
  vegetation = createWoodlandVegetation(shapes, { pathDistance, insideObject });
  meshes = [];
  vegetation.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
});

afterAll(() => {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  for (const mesh of meshes ?? []) {
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
    if (mesh.customDistanceMaterial) materials.add(mesh.customDistanceMaterial);
  }
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); shapes?.dispose();
});

describe('modeled woodland vegetation', () => {
  it('keeps detailed geometry finite and within the woodland draw and triangle budgets', () => {
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(14);
    let triangles = 0;
    for (const mesh of meshes) {
      const position = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      triangles += (mesh.geometry.index?.count ?? position.count) / 3;
      expect(position.array.every(Number.isFinite)).toBe(true);
      expect(normal.array.every(Number.isFinite)).toBe(true);
      const roots = mesh.geometry.getAttribute('windRoot');
      if (roots) expect(roots.count).toBe(position.count);
    }
    expect(triangles).toBeLessThanOrEqual(300_000);
  });

  it('roots every playable tree at its collider and leaves the distant river corridor open', () => {
    const roots = new Map<string, { x: number; z: number; height: number }>();
    for (const mesh of meshes.filter(mesh => mesh.castShadow)) {
      const attr = mesh.geometry.getAttribute('windRoot');
      expect(attr).toBeDefined();
      for (let i = 0; i < attr.count; i++) roots.set(`${attr.getX(i)},${attr.getY(i)}`, { x: attr.getX(i), z: attr.getY(i), height: attr.getZ(i) });
    }
    for (const { shape } of TERRAIN.filter(object => object.kind === 'tree')) {
      expect(roots.has(`${shape.center.x - 50},${shape.center.y - 50}`)).toBe(true);
    }
    const scenery = [...roots.values()].filter(root => Math.abs(root.x) > 50 || Math.abs(root.z) > 50);
    expect(scenery.length).toBeGreaterThan(60);
    expect(creek.type).toBe('aabb');
    if (creek.type !== 'aabb') return;
    for (const root of scenery) expect(Math.abs(root.x + 50 - creek.center.x)).toBeGreaterThanOrEqual(creek.half.x + root.height * .29 + 1.9);
  });

  it('keeps grass and fern roots out of the supplied path and prop clearances without shadow casting', () => {
    const plants = meshes.filter(mesh => !mesh.castShadow && mesh.geometry.hasAttribute('windRoot'));
    expect(plants.length).toBeGreaterThan(0);
    for (const mesh of plants) {
      const attr = mesh.geometry.getAttribute('windRoot');
      for (let i = 0; i < attr.count; i += 3) {
        const point = { x: attr.getX(i) + 50, y: attr.getY(i) + 50 };
        expect(pathDistance(point.x, point.y)).toBeGreaterThanOrEqual(2.6);
        expect(insideObject(point, .35)).toBe(false);
      }
    }
  });

  it('shares atmosphere and replayable wind phase between needles, trunks, low plants and shadows', () => {
    const rooted = meshes.filter(mesh => mesh.geometry.hasAttribute('windRoot'));
    const uniforms = rooted.map(mesh => compiledUniforms(mesh.material as Material));
    const canopy = rooted.find(mesh => mesh.castShadow)!;
    const depth = compiledUniforms(canopy.customDepthMaterial!, 'depth');
    const distance = compiledUniforms(canopy.customDistanceMaterial!, 'distance');
    for (const uniform of uniforms) for (const name of ['uTreeTime', 'uTreeVector', 'uTreeMotion']) {
      expect(uniform[name]).toBe(depth[name]); expect(uniform[name]).toBe(distance[name]);
    }
    const game = createGame({ seed: 42 });
    game.atmosphere.windAngle = Math.PI / 2; game.atmosphere.windStrength = .9;
    const before = structuredClone(game);
    vegetation.update(17, game, false);
    expect(depth.uTreeTime.value).toBe(17);
    expect(depth.uTreeVector.value.y).toBeGreaterThan(.15);
    expect(depth.uTreeVector.value.x).toBeCloseTo(0);
    vegetation.update(89, game, false);
    vegetation.update(17, { ...game, status: 'paused' }, false);
    expect(depth.uTreeTime.value).toBe(17);
    vegetation.update(28, game, true);
    expect(depth.uTreeMotion.value).toBe(0);
    expect(game).toEqual(before);
  });
});
