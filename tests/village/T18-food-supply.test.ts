import { expect,it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { submitCommand,advanceExecutions } from '../../src/games/camp/village/systems/commands';
import { refillFoodSources } from '../../src/games/camp/village/systems/food-supply';
it('collects configured food physically and refills by elapsed interval rather than a view refresh',()=>{
  const rules=selectWorldRules('village-v1','p4-social-content-v1');const s=createVillageState(rules,{id:'food',worldId:'food',classification:'fixture',seed:1,actors:[],inventory:{}});initializeEconomy(s,rules);
  const source=Object.values(s.economy!.foodSources!)[0];s.actors.player.position={...source.position};
  const receipt=submitCommand(s,{operationId:'berries',actorId:'player',action:'GATHER_FOOD',targetId:source.id,parameters:{},readSet:{},source:'player_input'});expect(receipt.accepted).toBe(true);
  for(let i=0;i<51;i++){s.elapsed+=.1;advanceExecutions(s,.1);}expect(s.actors.player.carried.food).toBe(1);expect(s.inventory.food??0).toBe(0);
  const remaining=s.economy!.foodSources![source.id].remaining;refillFoodSources(s);refillFoodSources(s);expect(s.economy!.foodSources![source.id].remaining).toBe(remaining);
  s.elapsed=720;refillFoodSources(s);expect(s.economy!.foodSources![source.id].remaining).toBe(source.capacity);
});
