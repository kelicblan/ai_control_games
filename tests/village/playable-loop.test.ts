import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeWorkshop } from '../../src/games/camp/village/systems/workshop';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { submitCommand } from '../../src/games/camp/village/systems/commands';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { updateMilestones, journeyView } from '../../src/games/camp/village/systems/milestones';
import { VillageAnimals } from '../../scripts/world/village-animals';
import { createAnimalWorld, hurtAnimal } from '../../src/games/camp/animals/engine';
import { compactRuntimeHistory } from '../../scripts/world/village-history';
const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
it('awards an NPC hunt once when its real quarry becomes a loot container', () => {
  const s = createVillageState(rules, { id: 'npc-hunt', classification: 'fixture', worldId: 'npc-hunt', seed: 1701, inventory: { food: 100 }, actors: [{ archetypeId: 'W001', instanceId: 'hunter' }] });
  initializeEconomy(s, rules); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 100 });
  const ecology = createAnimalWorld(1701, [{ x: 3, y: 0 }]); ecology.animals = ecology.animals.filter(a => a.species === 'rabbit').slice(0, 1);
  s.wildlife = { ecology, hunt: null, operations: {} }; const rabbit = ecology.animals[0]; hurtAnimal(ecology, rabbit, rabbit.hp, 'hunter');
  const db = new DatabaseSync(':memory:'), host = new VillageAnimals(db);
  try { host.step(s); expect(s.economy!.experience.hunter).toBe(3); expect(s.economy!.containers[`wildlife-loot:${rabbit.id}`]).toBeTruthy(); host.step(s); expect(s.economy!.experience.hunter).toBe(3); } finally { db.close(); }
});
it('executes construction, crafting, equipment, real hunting and a physical meat deposit with durable accomplishments', () => {
  const s = createVillageState(rules, { id: 'playable', classification: 'fixture', worldId: 'playable', seed: 1701, inventory: { food: 100, wood: 80, stone: 40, rope: 30 }, actors: [] });
  initializeEconomy(s, rules); initializeWorkshop(s); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 100 }); s.paused = false;
  const run = (action: string, parameters: Record<string, string> = {}) => {
    const r = submitCommand(s, { operationId: `loop-${s.nextExecution}`, actorId: 'player', action, parameters, readSet: {}, source: 'player_input' }); expect(r.accepted, r.reason).toBe(true);
    for (let i = 0; i < 1500 && ['accepted', 'running'].includes(s.executions[r.executionId!].status); i++) advanceVillage(s);
    expect(s.executions[r.executionId!].status, s.executions[r.executionId!].reason).toBe('completed');
  };
  run('BUILD_WORKSHOP'); run('CRAFT', { recipeId: 'WPN003', recipientId: 'player' }); const item = Object.values(s.economy!.items)[0]; run('EQUIP', { itemId: item.id });
  // A declared isolated rabbit fixture uses the real wildlife simulation, attack and harvest path.
  const ecology = createAnimalWorld(1701, [{ x: s.actors.player.position.x + 3, y: s.actors.player.position.y }]);
  ecology.animals = ecology.animals.filter(a => a.species === 'rabbit').slice(0, 1); const rabbit = ecology.animals[0]; rabbit.position = { x: s.actors.player.position.x + 3, y: s.actors.player.position.y };
  s.wildlife = { ecology, hunt: null, operations: {} }; const db = new DatabaseSync(':memory:'), animals = new VillageAnimals(db);
  try {
    animals.hunt(s, rabbit.id, 'hunt-loop');
    for (let i = 0; i < 1600 && s.wildlife!.hunt; i++) { advanceVillage(s); animals.step(s); }
    expect(s.events.some(e => e.kind === 'wildlife.hunt_completed')).toBe(true); expect(s.actors.player.carried.meat).toBeGreaterThan(0);
    const meat = s.actors.player.carried.meat; expect(s.economy!.journey!.completed.return).toBeUndefined();
    run('DEPOSIT'); expect(s.inventory.meat).toBe(meat);
    run('CRAFT', { recipeId: 'WPN001', recipientId: 'player' }); updateMilestones(s);
    expect(journeyView(s)).toMatchObject({ progress: 6, current: null }); expect(journeyView(s).choices).toHaveLength(2);
    compactRuntimeHistory(s, () => {}, 2);
    expect(restoreVillageState(JSON.parse(JSON.stringify(s)), rules)).toEqual(s);
  } finally { db.close(); }
});
