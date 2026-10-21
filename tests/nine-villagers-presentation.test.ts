import { Mesh } from 'three';
import { describe,expect,it } from 'vitest';
import { createCompanion } from '../scripts/unity/asset-source/characters';
import { Shapes } from '../scripts/unity/asset-source/geometry';
import { isWalkable } from '../src/games/camp/simulation/physics';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import type { ActionId,NpcId } from '../src/games/camp/simulation/types';
import { CAMP_HOUSES } from '../src/games/camp/world/definition';

const ids: NpcId[] = ['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye', 'tiesheng', 'aling', 'xiaoman', 'shenyan'];

describe('nine villagers presentation and housing', () => {
  it('gives all nine finite, independently reachable beds and safe task destinations', () => {
    const beds = ids.map(id => getTaskDestination('rest', id));
    expect(new Set(beds.map(p => `${p.x},${p.y}`)).size).toBe(9);
    ids.forEach((id, index) => {
      expect(beds[index]).toEqual(CAMP_HOUSES[index + 1].beds[0]);
      expect(isWalkable(beds[index], false)).toBe(true);
      for (const action of ['wood', 'food', 'fire', 'eat', 'rest', 'camp', 'explore'] as ActionId[]) {
        const point = getTaskDestination(action, id);
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        expect(isWalkable(point, false), `${id} ${action}`).toBe(true);
      }
    });
    const help = ids.map(id => getTaskDestination('help', id, false, { x: 50, y: 110 }));
    expect(new Set(help.map(p => `${p.x},${p.y}`)).size).toBe(9);
    help.forEach(point => expect(Math.hypot(point.x - 50, point.y - 110)).toBeLessThan(3.5));
    for (let i = 0; i < help.length; i++) for (let j = i + 1; j < help.length; j++) {
      expect(Math.hypot(help[i].x - help[j].x, help[i].y - help[j].y)).toBeGreaterThan(2.2);
    }
    expect(CAMP_HOUSES.slice(6).map(h => h.name)).toEqual(['属民居所·铁生', '属民居所·阿绫', '属民居所·小满', '属民居所·沈砚']);
  });

  it('renders nine complete rigs with distinct clothing and newcomer silhouettes', () => {
    const shapes = new Shapes();
    const rigs = ids.map(id => createCompanion(id, shapes));
    expect(new Set(rigs.map(rig => rig.dryColors[0].getHexString())).size).toBe(9);
    expect(new Set(rigs.slice(5).map(rig => `${rig.root.scale.y},${rig.torso.scale.x}`)).size).toBe(4);
    for (const rig of rigs) {
      expect(rig.root.userData.npcId).toBe(rig.id);
      let meshCount = 0;
      rig.root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        meshCount++;
        expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
        object.geometry.dispose();
      });
      expect(meshCount).toBeGreaterThan(20);
      rig.warmMaterials.forEach(material => material.dispose());
    }
    shapes.dispose();
  });
});
