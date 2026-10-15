import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const bytes = readFileSync(new URL('../public/assets/models/lord/model.glb', import.meta.url));
const length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + length).toString());
const binary = bytes.subarray(28 + length);
function values(index: number): number[] {
  const a = doc.accessors[index], view = doc.bufferViews[a.bufferView], size = a.type === 'VEC4' ? 4 : a.type === 'VEC3' ? 3 : 1;
  return Array.from({ length: a.count * size }, (_, i) => binary.readFloatLE((view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * 4));
}
describe('delivered lord model', () => {
  it('retains textures, skin and the desktop geometry budget', () => {
    expect(doc.images.length).toBe(3); expect(doc.skins[0].joints.length).toBe(82);
    const p = doc.meshes[0].primitives[0]; expect(doc.accessors[p.indices].count / 3).toBeLessThanOrEqual(30000);
    expect(p.attributes.JOINTS_0).toBeDefined(); expect(p.attributes.WEIGHTS_0).toBeDefined(); expect(p.attributes.TEXCOORD_0).toBeDefined();
  });
  it('contains seamless idle and walk clips with no horizontal root motion', () => {
    expect(doc.animations.map((a: { name: string }) => a.name)).toEqual(['Idle', 'Walk']);
    for (const clip of doc.animations) for (const channel of clip.channels) {
      const a = clip.samplers[channel.sampler], v = values(a.output), width = channel.target.path === 'rotation' ? 4 : 3;
      expect(v.every(Number.isFinite)).toBe(true);
      expect(v.slice(0, width)).toEqual(v.slice(-width));
      if (channel.target.path === 'translation') {
        for (let i = 0; i < v.length; i += 3) { expect(v[i]).toBe(v[0]); expect(v[i + 2]).toBe(v[2]); }
      }
    }
  });
});
