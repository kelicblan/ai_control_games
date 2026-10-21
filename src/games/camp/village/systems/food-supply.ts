import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { distance, supplement } from './resources';
import { moveTowards } from './combat-actions';
import { routeDistance } from './navigation';
import { fenceBlocksSegment } from './targeting';
export interface FoodSupply { siteCount: number; capacity: number; workSeconds: number; refillSeconds: number }
export function refillFoodSources(state: VillageState) {
  if (!state.economy?.foodSources) return;
  const config=supplement<{foodSupply:FoodSupply}>(selectWorldRules('village-v1',state.ruleVersion),'D12').foodSupply;
  const interval=Math.floor(state.elapsed/config.refillSeconds);
  for(const site of Object.values(state.economy.foodSources))if(interval>site.refilledInterval){site.remaining=site.capacity;site.refilledInterval=interval;appendEvent(state,'food.source_refilled',[],{siteId:site.id,interval});}
}
export const FOOD_GATHER_CAPABILITY:ActionCapability<VillageState>={
  id:'GATHER_FOOD',validate(state,command){
    const site=command.targetId&&state.economy?.foodSources?.[command.targetId],actor=state.actors[command.actorId];ensure(site&&site.remaining>0&&Object.keys(command.parameters).length===0,'Food source unavailable');
    const rules=selectWorldRules('village-v1',state.ruleVersion),config=supplement<{foodSupply:FoodSupply}>(rules,'D12').foodSupply,capacity=supplement<{carryCapacity:number}>(rules,'D17').carryCapacity;
    ensure(Object.values(actor.carried).reduce((a,b)=>a+b,0)<capacity,'Food carrier full');
    const route=state.navigation?routeDistance(state,actor.position,site.position):distance(actor.position,site.position);ensure(Number.isFinite(route),'Food source unreachable');
    return{duration:Math.max(.1,route/(4*actor.attributes.moveSpeed)+config.workSeconds/actor.attributes.gather),cost:{}};
  },advance(state,execution,dt){const site=state.economy!.foodSources![execution.command.targetId!],actor=state.actors[execution.command.actorId];if(distance(actor.position,site.position)>1||fenceBlocksSegment(state,actor.position,site.position))ensure(moveTowards(state,actor.position,site.position,4*actor.attributes.moveSpeed,dt),'Food route blocked');},
  complete(state,execution){const site=state.economy!.foodSources![execution.command.targetId!],actor=state.actors[execution.command.actorId],rules=selectWorldRules('village-v1',state.ruleVersion),capacity=supplement<{carryCapacity:number}>(rules,'D17').carryCapacity;ensure(site.remaining>0&&distance(actor.position,site.position)<=2&&!fenceBlocksSegment(state,actor.position,site.position)&&Object.values(actor.carried).reduce((a,b)=>a+b,0)<capacity,'Food collection conditions changed');site.remaining--;actor.carried.food=(actor.carried.food??0)+1;actor.body.energy=Math.max(0,actor.body.energy-2);appendEvent(state,'food.gathered',[actor.id],{siteId:site.id,quantity:1,remaining:site.remaining},execution.id);},
};
