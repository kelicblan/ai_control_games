import { expect, it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { resourceLevel } from '../../src/games/camp/village/systems/exploration';
import { worldToLogicalUnits } from '../../src/games/camp/village/domain/units';
it('uses camp-relative logical meters and explicitly configured ten resource levels', () => {
  const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
  expect(worldToLogicalUnits(30)).toBe(30);
  expect(Array.from({ length: 10 }, (_, i) => resourceLevel(i * 10, rules))).toEqual([1,2,3,4,5,6,7,8,9,10]);
  expect(rules.tables.nodes).toHaveLength(30); expect(resourceLevel(99999, rules)).toBe(10);
  expect(() => resourceLevel(-1, rules)).toThrow();
});
