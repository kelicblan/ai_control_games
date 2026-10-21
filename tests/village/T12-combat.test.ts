import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeCombat, resolveAttack, damageForHit } from '../../src/games/camp/village/systems/combat';
import { canApplyHit } from '../../src/games/camp/village/systems/targeting';
const rules = selectWorldRules('village-v1', 'p2-life-alpha-v1');
function world() {
  const s = createVillageState(rules, { id: 'combat', classification: 'fixture', worldId: 'combat', seed: 1, actors: [{ archetypeId: 'W001', instanceId: 'a' }], inventory: {} });
  initializeEconomy(s, rules); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 10 });
  s.combat!.enemies.wolf = { id: 'wolf', archetypeId: 'M001', hp: 40, position: { x: 1, y: 0 }, nextAttackAt: 0, waveId: 'fixture', deathEventId: null };
  return s;
}
it('uses F005 floor after hit and critical, capped defense and minimum one', () => {
  expect(damageForHit(20, 10, false, 1.5)).toBe(16);
  expect(damageForHit(20, 10, true, 1.5)).toBe(25);
  expect(damageForHit(1, 10000, false, 1.5)).toBe(1);
});
it('misses deal zero and attack cooldown prevents repeated damage', () => {
  const s = world();
  expect(resolveAttack(s, { attackerId: 'player', targetId: 'wolf' }, () => .999).damage).toBe(0);
  const hp = s.combat!.enemies.wolf.hp;
  expect(resolveAttack(s, { attackerId: 'player', targetId: 'wolf' }, () => 0).reason).toBe('cooldown');
  expect(s.combat!.enemies.wolf.hp).toBe(hp);
  s.elapsed = 10;
  expect(resolveAttack(s, { attackerId: 'player', targetId: 'wolf' }, () => 0).damage).toBeGreaterThanOrEqual(1);
});
it('requires reach and intact fence blocks attacks across the perimeter', () => {
  const s = world(); s.combat!.enemies.wolf.position.x = 20;
  expect(canApplyHit(s, 'player', 'wolf').allowed).toBe(false);
  s.actors.player.position.x = 9.5; s.combat!.enemies.wolf.position.x = 10.5;
  expect(canApplyHit(s, 'player', 'wolf').reason).toBe('fence');
  s.economy!.fence.hp = 0;
  expect(canApplyHit(s, 'player', 'wolf').allowed).toBe(true);
});
