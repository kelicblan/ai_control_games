import { expect, it } from 'vitest';
import { VillageRuntime } from '../../scripts/world/village-runtime';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { recipeCost } from '../../src/games/camp/village/systems/profession';
import { createActor } from '../../src/games/camp/village/domain/actors';
it('projects current-rule recipes with player costs without changing persisted state', () => {
  const runtime = new VillageRuntime(':memory:');
  try {
    const state = runtime.create('ui', { id: 'ui', classification: 'experiment', worldId: 'ui', ruleVersion: 'p4-social-content-v1', seed: 17, inventory: { wood: 35, stone: 5, rope: 5, food: 20 }, actors: [] });
    const view = runtime.read('ui')! as typeof state & { uiCatalog: { weapons: { id: string; cost: unknown; duration: number }[]; fences: unknown[] } };
    const rules = selectWorldRules('village-v1', view.ruleVersion);
    expect(view.uiCatalog.weapons).toHaveLength(rules.tables.weapons.length);
    for (const recipe of rules.tables.weapons) {
      const entry = view.uiCatalog.weapons.find(w => w.id === recipe.id)!;
      const player = createActor(view.actors.player.archetypeId, 'player', {}, rules.tables.actors);
      expect(entry.cost).toEqual(recipeCost(rules, player, recipe));
      expect(entry.duration).toBeGreaterThan(0);
    }
    expect(view.uiCatalog.fences).toEqual(rules.tables.fences);
    expect(runtime.read('ui')!.revision).toBe(state.revision);
    expect(runtime.read('ui')!.inventory).toEqual(state.inventory);
  } finally { runtime.close(); }
});
