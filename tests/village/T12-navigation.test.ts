import { expect, it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { moveTowards } from '../../src/games/camp/village/systems/combat-actions';
import { submitCommand, advanceExecutions } from '../../src/games/camp/village/systems/commands';
it('logistics uses the same physical fence check as combat rather than interpolating through it', () => {
  const rules=selectWorldRules('village-v1','p3-defense-alpha-v1');
  const s=createVillageState(rules,{id:'nav',worldId:'nav',classification:'fixture',seed:1,actors:[],inventory:{}});initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:10});
  s.actors.player.position={x:9.9,y:0};const before={...s.actors.player.position};moveTowards(s,s.actors.player.position,{x:12,y:0},4,.1);expect(Math.hypot(s.actors.player.position.x,s.actors.player.position.y)).toBeLessThanOrEqual(10);expect(Math.hypot(s.actors.player.position.x-before.x,s.actors.player.position.y-before.y)).toBeLessThanOrEqual(.4+1e-8);
  s.economy!.containers.outside={id:'outside',position:{x:12,y:0},resources:{wood:1},sourceEventId:'fixture'};
  const receipt=submitCommand(s,{operationId:'pickup',actorId:'player',action:'PICK_UP',targetId:'outside',parameters:{},readSet:{},source:'player_input'});
  if(receipt.accepted){advanceExecutions(s,.1);expect(s.actors.player.position.x).toBeLessThanOrEqual(10);}else expect(receipt.reason).toBeTruthy();
});
it('blocks walking into an occupied body while allowing initially overlapping actors to separate',()=>{
 const r=selectWorldRules('village-v1','p3-defense-alpha-v1'),s=createVillageState(r,{id:'peers',worldId:'peers',classification:'fixture',seed:1,actors:[{archetypeId:'W001',instanceId:'a',initial:{position:{x:.6,y:0}}}],inventory:{}});initializeEconomy(s,r);initializeCombat(s,{center:{x:0,y:0},radius:10});
 expect(moveTowards(s,s.actors.player.position,{x:1,y:0},4,.1)).toBe(true);expect(Math.hypot(s.actors.player.position.x-.6,s.actors.player.position.y)).toBeGreaterThanOrEqual(.55);expect(Math.abs(s.actors.player.position.y)).toBeGreaterThan(0);
 s.actors.player.position={x:0,y:0};s.actors.a.position={x:0,y:0};expect(moveTowards(s,s.actors.player.position,{x:1,y:0},4,.1)).toBe(true);
});
