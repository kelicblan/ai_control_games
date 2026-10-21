import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { advanceWaveSchedule } from '../../src/games/camp/village/systems/waves';
import { settleDeathLoot } from '../../src/games/camp/village/systems/loot';
import { appendEvent } from '../../packages/action-runtime/src/runtime';
const rules = selectWorldRules('village-v1', 'p3-defense-alpha-v1');
it('crosses all ten source waves exactly once including catchup and reload', () => {
  const s = createVillageState(rules, { id: 'waves', classification: 'fixture', worldId: 'waves', seed: 1, actors: [], inventory: {} });
  initializeEconomy(s, rules); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 10 });
  s.elapsed = 175 * 720; advanceWaveSchedule(s);
  const waves = s.events.filter(e => e.kind === 'wave.spawned');
  expect(waves.map(e => e.facts.count)).toEqual([3, 5, 7, 8, 10, 12, 14, 15, 17, 19]);
  const copy = JSON.parse(JSON.stringify(s)); advanceWaveSchedule(copy);
  expect(copy.events).toHaveLength(s.events.length);
  for (const w of rules.tables.waves) expect(w.counts.M004).toBeLessThanOrEqual(1);
});
it.each(['M004','M005'])('source elite %s unlocks only the axe recipe, without granting the item', archetypeId=>{
  const s=createVillageState(rules,{id:'elite',worldId:'elite',classification:'fixture',seed:1,actors:[],inventory:{}});initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:10});
  s.combat!.enemies.elite={id:'elite',archetypeId,hp:0,position:{x:0,y:0},nextAttackAt:0,waveId:'fixture',deathEventId:null};
  const event=appendEvent(s,'enemy.died',['player'],{enemyId:'elite',archetypeId});s.combat!.enemies.elite.deathEventId=event.id;settleDeathLoot(s,event.id);
  expect(s.combat!.unlockedRecipes).toEqual(['WPN006']);expect(s.economy!.items).toEqual({});
});
it('loot requires actual death evidence and is settled once into a physical container', () => {
  const s = createVillageState(rules, { id: 'loot', classification: 'fixture', worldId: 'loot', seed: 1, actors: [], inventory: {} });
  initializeEconomy(s, rules); initializeCombat(s, { center: { x: 0, y: 0 }, radius: 10 }); s.elapsed = (rules.tables.waves[0].day - 1) * 720 + 480; advanceWaveSchedule(s);
  const enemy = Object.values(s.combat!.enemies)[0];
  expect(() => settleDeathLoot(s, 'fiction')).toThrow();
  enemy.hp = 0; const event = appendEvent(s, 'enemy.died', ['player'], { enemyId: enemy.id, archetypeId: enemy.archetypeId }); enemy.deathEventId = event.id;
  const first = settleDeathLoot(s, event.id); expect(settleDeathLoot(s, event.id)).toBe(first);
  expect(Object.keys(s.economy!.containers)).toHaveLength(1); expect(s.inventory).toEqual({});
});
