import { describe, expect, it } from 'vitest';
import { Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry } from 'three';
import { ExplorationMap } from '../packages/world-core/src';
import { createWorldTerrain } from '../packages/world-three/src/terrain';

describe('unified landscape visibility', () => {
  it('keeps every source triangle but submits only nearby visible terrain cells', () => {
    const source = new Group(), geometry = new PlaneGeometry(1024, 1024, 64, 64); geometry.rotateX(-Math.PI / 2);
    source.add(new Mesh(geometry, new MeshBasicMaterial()));
    const terrain = createWorldTerrain({ exploration: new ExplorationMap({ seed: 1, generatorVersion: 1, center: { x: 0, y: 0 }, initialRadius: 1000 }),
      sample: () => ({ height: 0, water: false, waterLevel: 0, forest: 0, road: 0, biome: 'grass' }),
      riverX: () => -9999, riverWidth: () => 1, treeAt: () => null, groundModel: { source, min: -512, max: 512 } });
    terrain.group.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(58, 1.6, .2, 100); camera.position.set(0, 10, 20); camera.lookAt(0, 0, -50); camera.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let total = 0, visible = 0;
    terrain.group.getObjectByName('Unified valley terrain GLB')!.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const count = (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      total += count; if (frustum.intersectsObject(o)) visible += count;
    });
    expect(total).toBe(8192); expect(visible).toBeGreaterThan(0); expect(visible).toBeLessThan(total / 2);
    expect(geometry.index!.count).toBe(24576); terrain.dispose();
  });
});
