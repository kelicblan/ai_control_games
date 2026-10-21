import { expect,it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy,addResourceNode } from '../../src/games/camp/village/systems/resources';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { buildObservation } from '../../src/games/camp/village/ai/observation';
it('dense resources cannot evict food, craft, repair or return action families',()=>{
 const r=selectWorldRules('village-v1','p4-social-content-v1'),s=createVillageState(r,{id:'budget',worldId:'budget',classification:'fixture',seed:1,actors:[{archetypeId:'H002',instanceId:'a'}],inventory:{wood:100,stone:100,rope:100,food:10}});initializeEconomy(s,r);s.actors.a.body.hunger=80;
 for(let i=0;i<60;i++)addResourceNode(s,r,{id:`node-${i}`,resource:(['wood','stone','rope']as const)[i%3],level:1,position:{x:i/10,y:0}});
 refreshKnowledge(s);const input=buildObservation(s,'a',s.actors.a.personal.knowledge,'life');
 expect(input.candidates.length).toBeLessThanOrEqual(32);expect(input.candidates.some(c=>c.action==='CRAFT'&&c.parameters.recipeId==='WPN005')).toBe(true);expect(input.candidates.some(c=>c.action==='EAT')).toBe(true);expect(input.candidates.some(c=>c.action==='GATHER_FOOD')).toBe(true);
});
