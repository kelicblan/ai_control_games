import { describe,expect,it } from 'vitest';
import { ExplorationMap } from '../packages/world-core/src';
import { createCompanion,updateCompanion } from '../scripts/unity/asset-source/characters';
import { Shapes } from '../scripts/unity/asset-source/geometry';
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
});
