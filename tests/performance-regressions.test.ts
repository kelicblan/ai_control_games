import { describe, expect, it } from 'vitest';
import { ExplorationMap } from '../packages/world-core/src';
import { createWorldTerrain } from '../packages/world-three/src/terrain';
import { createCompanion, updateCompanion } from '../src/scene/characters';
import { Shapes } from '../src/scene/geometry';
import { createGame } from '../src/games/camp/simulation/engine';

describe('world presentation regressions', () => {
  it('smooths horizontal steps equally at ground level and on high terrain', () => {
    const game = createGame({ seed: 17 }), npc = game.npcs[0], shapes = new Shapes();
    npc.position = { x: 50, y: 60 }; npc.destination = { ...npc.position };
    const low = createCompanion(npc.id, shapes), high = createCompanion(npc.id, shapes);
    for (const rig of [low, high]) updateCompanion(rig, npc, .016, 0, 0, false, true, false, game.atmosphere);
    high.root.position.y = 20;
    npc.position.x += .1;
    for (const rig of [low, high]) updateCompanion(rig, npc, .016, 0, 0, false, true, false, game.atmosphere);
    expect(high.root.position.x).toBeCloseTo(low.root.position.x, 8);
    expect(high.root.position.x).toBeGreaterThan(0);
    expect(high.root.position.x).toBeLessThan(.1);
    expect(high.root.position.y).toBe(20);
    npc.position.x += 10;
    updateCompanion(high, npc, .016, 0, 0, false, true, false, game.atmosphere);
    expect(high.root.position.x).toBeCloseTo(10.1);
    shapes.dispose();
  });
  it('does not invalidate unchanged exploration and applies revocation', () => {
    const map = new ExplorationMap({ seed: 1, generatorVersion: 1, center: { x: 0, y: 0 }, initialRadius: 0 });
    map.reveal({ x: 200, y: 200 }, 16);
    const before = map.revision, save = map.snapshot();
    map.synchronize(save);
    expect(map.revision).toBe(before);
    map.synchronize({ ...save, chunks: {} });
    expect(map.isExplored({ x: 200, y: 200 })).toBe(false);
    expect(map.revision).toBe(before + 1);
  });
  it('keeps unaffected terrain objects when one distant exploration block changes', () => {
    const map = new ExplorationMap({ seed: 1, generatorVersion: 1, center: { x: 0, y: 0 }, initialRadius: 100 });
    const terrain = createWorldTerrain({ exploration: map,
      sample: () => ({ height: 0, water: false, waterLevel: -1, forest: 0, road: 0, biome: 'grass' }),
      riverX: () => 100000, riverWidth: () => 1, treeAt: () => null });
    terrain.setView({ x: 0, y: 0 }, 128, { x: 0, y: 0 });
    const stable = terrain.group.children.find(o => o.position.x === -178 && o.position.z === -178)!;
    expect(stable).toBeDefined();
    map.reveal({ x: 280, y: 280 }, 16);
    terrain.setView({ x: 0, y: 0 }, 128, { x: 0, y: 0 });
    expect(terrain.group.children).toContain(stable);
    terrain.setView({ x: 0, y: 0 }, 400, { x: 0, y: 0 });
    expect(terrain.group.children).toContain(stable);
    terrain.dispose();
  });
  it('streams terrain across frames and finishes the requested window', () => {
    const map = new ExplorationMap({ seed: 1, generatorVersion: 1, center: { x: 0, y: 0 }, initialRadius: 100 });
    const terrain = createWorldTerrain({ exploration: map, maxBuildsPerFrame: 2, buildBudgetMs: Infinity,
      sample: () => ({ height: 0, water: false, waterLevel: -1, forest: 0, road: 0, biome: 'grass' }),
      riverX: () => 100000, riverWidth: () => 1, treeAt: () => null });
    terrain.setView({ x: 0, y: 0 }, 128, { x: 0, y: 0 });
    expect(terrain.stats()).toMatchObject({ chunks: 0, pending: 25 });
    terrain.update(0, { x: 0, y: 0 }, []);
    expect(terrain.stats()).toMatchObject({ chunks: 2, pending: 23 });
    for (let i = 0; i < 12; i++) terrain.update(i, { x: 0, y: 0 }, []);
    expect(terrain.stats()).toMatchObject({ chunks: 25, pending: 0, created: 25, released: 0 });
    terrain.dispose();
  });
});
