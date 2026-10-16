import { describe, expect, it } from 'vitest';
import { inspectGlb } from '../scripts/unity-asset-inventory';

function glb(json: unknown) {
  const raw = Buffer.from(JSON.stringify(json)), size = Math.ceil(raw.length / 4) * 4;
  const data = Buffer.alloc(20 + size, 0x20);
  data.writeUInt32LE(0x46546c67, 0); data.writeUInt32LE(2, 4); data.writeUInt32LE(data.length, 8);
  data.writeUInt32LE(size, 12); data.writeUInt32LE(0x4e4f534a, 16); raw.copy(data, 20); return data;
}
describe('Unity asset import inventory', () => {
  it('counts unique triangle geometry, skinning, clips and material dependencies', () => {
    const data = glb({ asset: { version: '2.0' }, accessors: [{ count: 6 }, { count: 9 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }, { mesh: 0 }], skins: [{ joints: [0] }], animations: [{ name: 'Walk' }],
      materials: [{}], textures: [{}], images: [{ uri: 'texture.png' }] });
    expect(inspectGlb(data)).toMatchObject({ meshes: 1, primitives: 1, vertices: 6, triangles: 3, meshInstances: 2,
      skins: 1, animations: 1, materials: 1, textures: 1, externalImages: ['texture.png'] });
  });
  it('rejects truncated assets, unsupported containers and invalid geometry references', () => {
    expect(() => inspectGlb(Buffer.alloc(8))).toThrow('GLB');
    const invalid = glb({ asset: { version: '2.0' } }); invalid.writeUInt32LE(99, 4);
    expect(() => inspectGlb(invalid)).toThrow('GLB');
    expect(() => inspectGlb(glb({ asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 5 } }] }] }))).toThrow('accessor');
  });
});
