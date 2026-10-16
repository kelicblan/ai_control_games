import { describe, expect, it } from 'vitest';
import { buildNativeSceneBlueprint } from '../scripts/export-unity-scene';
import { CAMP_HOUSES, sampleCampSurface } from '../src/games/camp/world/definition';
import { LANDSCAPE_REVISION } from '../src/games/camp/world/landscape';

describe('native scene blueprint', () => {
  it('preserves authored geography, real characters, open doorways and deterministic forest', () => {
    const scene = buildNativeSceneBlueprint(17);
    expect(scene).toEqual(buildNativeSceneBlueprint(17));
    expect(scene.terrainRevision).toBe(LANDSCAPE_REVISION);
    expect(scene.characters.filter(c => c.id !== 'lord')).toHaveLength(9);
    expect(scene.placements.filter(p => p.category === 'home')).toHaveLength(CAMP_HOUSES.length);
    expect(scene.placements.filter(p => p.category === 'forest').length).toBeGreaterThan(100);
    expect(scene.placements.filter(p => p.category === 'grass').length).toBeGreaterThan(100);
    expect(scene.placements.filter(p => p.category === 'shrub').length).toBeGreaterThan(30);
    expect(scene.placements.filter(p => p.category === 'rock').length).toBeGreaterThan(5);
    for (const house of CAMP_HOUSES) {
      const p = scene.placements.find(p => p.id === house.id)!;
      expect(p.yaw).toBe(90); // Web -PI/2 becomes +90 after glTF handedness conversion.
      expect(p.position).toEqual([house.center.x, sampleCampSurface(house.center,17).height, house.center.y]);
      const door = { x: house.center.x, y: house.center.y + house.half.y };
      expect(scene.colliders.filter(c => c.owner === house.id).some(c => Math.abs(door.x-c.x)<c.halfX && Math.abs(door.y-c.z)<c.halfZ)).toBe(false);
    }
    expect(scene.river.vertices.length).toBeGreaterThan(1000);
    expect(scene.rooms).toHaveLength(CAMP_HOUSES.length+2);
    expect(scene.rooms.find(r=>r.id==='lord-house')?.doorHeight).toBe(16);
    expect(scene.wilderness.animals).toHaveLength(43);
    expect(scene.wilderness.resources.length).toBeGreaterThan(50);
    expect(Object.keys(scene.wilderness.templates).sort()).toEqual(['berries','boar','greens','mushrooms','pheasant','rabbit','roots','tiger','wood']);
    expect(Object.keys(scene.wilderness.npcProps)).toHaveLength(9);
    expect(scene.wilderness.npcProps.azhuang.basket.children.length).toBeGreaterThan(0);
    expect(scene.assets.every(a=>a.sha256.length===64 && a.destination.endsWith('.glb'))).toBe(true);
  });
});
