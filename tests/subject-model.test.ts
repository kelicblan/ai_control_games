import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NPC_IDS } from '../src/games/camp/simulation/types';

describe('commoner assets and animations', () => {
  for (const id of NPC_IDS) it(`${id} retains textures and a valid in-place rig under 15k triangles`, () => {
    const bytes = readFileSync(new URL(`../public/assets/models/subjects/${id}/model.glb`, import.meta.url));
    const length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + length).toString()), binary = bytes.subarray(28 + length);
    expect(doc.images.length).toBeGreaterThanOrEqual(1); expect(doc.skins[0].joints.length).toBeGreaterThan(20);
    let faces = 0; for (const mesh of doc.meshes) for (const p of mesh.primitives) {
      faces += doc.accessors[p.indices].count / 3; expect(p.attributes.JOINTS_0).toBeDefined(); expect(p.attributes.TEXCOORD_0).toBeDefined();
    }
    expect(faces).toBeLessThanOrEqual(15000);
    expect(doc.animations.map((a: { name: string }) => a.name)).toEqual(['Idle', 'Walk', 'Work', 'Gather', 'Rest', 'Carry', 'WalkCarry']);
    expect(doc.nodes[doc.extras.anatomicalNodes.RightHand].name).toBe('RightHand');
    for (const clip of doc.animations) for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler], a = doc.accessors[sampler.output], view = doc.bufferViews[a.bufferView];
      const width = a.type === 'VEC4' ? 4 : 3, values = Array.from({ length: a.count * width }, (_, i) => binary.readFloatLE((view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * 4));
      expect(values.every(Number.isFinite)).toBe(true); expect(values.slice(0, width)).toEqual(values.slice(-width));
      for (let i = 0; i < values.length; i += width) {
        if (width === 4) expect(Math.hypot(...values.slice(i, i + 4))).toBeCloseTo(1, 5);
        else { expect(values[i]).toBe(values[0]); expect(values[i + 2]).toBe(values[2]); }
      }
    }
  });
});
