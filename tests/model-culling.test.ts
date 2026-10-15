import { describe, expect, it } from 'vitest';
import { BoxGeometry, Frustum, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { instanceModel, prepareModelTemplate } from '../packages/world-three/src/modelInstances';

describe('spatial model batches', () => {
  it('culls distant prop batches without dropping or moving any instances', () => {
    const source = new Group(); source.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    const template = prepareModelTemplate(source);
    const model = instanceModel(template, [
      { x: 0, y: 0, z: -10, scale: 2 },
      { x: 1000, y: 3, z: -10, scale: 3 },
      { x: -1000, y: 5, z: -10, scale: 4 },
    ], 'props', true, 64);
    model.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(60, 1, .1, 100); camera.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const positions: Vector3[] = []; let submitted = 0;
    model.traverse(object => {
      if (!(object instanceof InstancedMesh)) return;
      if (frustum.intersectsObject(object)) submitted += object.count;
      for (let i = 0; i < object.count; i++) {
        const matrix = new Matrix4(); object.getMatrixAt(i, matrix);
        positions.push(new Vector3().setFromMatrixPosition(matrix.premultiply(object.matrixWorld)));
      }
      expect(object.geometry).toBe(template.parts[0].geometry);
    });
    expect(positions.map(p => p.toArray()).sort((a, b) => a[0] - b[0])).toEqual([[-1000, 5, -10], [0, 0, -10], [1000, 3, -10]]);
    expect(submitted).toBe(1);
    template.dispose();
  });
});
