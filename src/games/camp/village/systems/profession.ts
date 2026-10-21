import type{CompiledVillageRules,WeaponRule}from'../config/schema';
import type{ActorInstance}from'../domain/types';
import{supplement}from'./resources';
export function professionMultiplier(rules:CompiledVillageRules,actor:ActorInstance,key:'gatherMultiplier'|'craftMultiplier'|'repairMultiplier'|'materialCostMultiplier'){
 const effects=supplement<{professionEffects:Record<string,Partial<Record<typeof key,number>>>}>(rules,'D11').professionEffects;
 return effects[actor.archetypeId]?.[key]??1;
}
export function recipeCost(rules:CompiledVillageRules,actor:ActorInstance,recipe:WeaponRule){
 // Source H006: wooden sword and bows only. Ceil prevents fractional/free ingredients.
 const rate=['WPN002','WPN003','WPN005'].includes(recipe.id)?professionMultiplier(rules,actor,'materialCostMultiplier'):1;
 return Object.fromEntries(Object.entries(recipe.cost).map(([id,n])=>[id,Math.ceil(n*rate)]));
}
