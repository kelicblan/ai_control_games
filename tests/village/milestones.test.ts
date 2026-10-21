import { expect, it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { appendEvent } from '../../packages/action-runtime/src/runtime';
import { updateMilestones, journeyView } from '../../src/games/camp/village/systems/milestones';
const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
function world() { const s = createVillageState(rules, { id: 'goals', classification: 'fixture', worldId: 'goals', seed: 1, inventory: { food: 100 }, actors: [] }); initializeEconomy(s, rules); return s; }
it('preserves achieved food security while displaying current shortage, without mutating on reads', () => {
  const s = world(); updateMilestones(s); const id = s.economy!.journey!.completed.food.eventId;
  s.inventory.food = 0; updateMilestones(s); updateMilestones(s);
  expect(s.economy!.journey!.completed.food.eventId).toBe(id);
  const before = JSON.stringify(s), view = journeyView(s);
  expect(view.completed.some(g => g.id === 'food')).toBe(true); expect(view.food.days).toBe(0); expect(view.risk).toContain('不足');
  expect(JSON.stringify(s)).toBe(before); expect(s.events.filter(e => e.kind === 'milestone.completed' && e.facts.goalId === 'food')).toHaveLength(1);
  expect(restoreVillageState(JSON.parse(JSON.stringify(s)), rules)).toEqual(s);
});
it('requires a completed hunt and a subsequent meat deposit, not command acceptance or carried meat', () => {
  const s = world(); appendEvent(s, 'execution.accepted', ['player'], { action: 'ATTACK' }); s.actors.player.carried.meat = 3; updateMilestones(s);
  expect(s.economy!.journey!.completed.hunt).toBeUndefined(); expect(s.economy!.journey!.completed.return).toBeUndefined();
  const hunt = appendEvent(s, 'wildlife.hunt_completed', ['player'], { amount: 3 }); updateMilestones(s);
  expect(s.economy!.journey!.completed.hunt).toBeTruthy(); expect(s.economy!.journey!.completed.return).toBeUndefined();
  const deposit = appendEvent(s, 'resources.deposited', ['player'], { quantities: { meat: 3 } }); updateMilestones(s); updateMilestones(s);
  expect(s.economy!.journey!.completed.return).toBeTruthy();
  expect(s.events.find(e => e.id === s.economy!.journey!.completed.return.eventId)?.facts).toMatchObject({ sourceEventId: deposit.id, huntEventId: hunt.id });
});
it('does not credit unrelated carried meat while an NPC quarry remains uncollected', () => {
  const s = world();
  appendEvent(s, 'wildlife.harvested', ['player'], { animalId: 'rabbit', containerId: 'loot', amount: 3 });
  updateMilestones(s);
  appendEvent(s, 'resources.deposited', ['player'], { quantities: { meat: 2 } }); updateMilestones(s);
  expect(s.economy!.journey!.completed.hunt).toBeTruthy(); expect(s.economy!.journey!.completed.return).toBeUndefined();
});
