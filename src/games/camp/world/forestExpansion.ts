import type {Point,VillageState} from '../village/domain/types';
import type {CompiledVillageRules} from '../village/config/schema';
import type {WildlifeAuthority} from '../animals/authority';
import {importEcologyNodes,supplement} from '../village/systems/resources';

export interface ForestExpansion {
  id:string;
  resources:{id:string;kind:string;position:Point;stand:Point;capacity:number;recovery:number}[];
  habitats:{deer:Point[];boar:Point[]};
  drinkingWater?:Point[];
  clearings:{id:string;position:Point;radius:number;use:string}[];
  resourceGrid?:{minX:number;minY:number;step:number;width:number;height:number;walkable:number[]};
}
/** Add finite sites once. Existing depletion, inventories and task reservations stay authoritative. */
export function importForestResources(state:VillageState,rules:CompiledVillageRules,forest:ForestExpansion|null|undefined){
  if(!forest||!state.economy||state.navigation?.mode!=='shared-world')return;
  importEcologyNodes(state,rules,forest.resources.filter(s=>s.kind==='wood'));
  const config=supplement<{foodSupply:{capacity?:number;refillSeconds?:number}}>(rules,'D12').foodSupply;
  if(!config.capacity||!config.refillSeconds)return;
  const food=state.economy.foodSources??={};
  for(const site of forest.resources)if(site.kind!=='wood'&&!food[site.id])food[site.id]={id:site.id,position:{...site.stand},remaining:config.capacity,capacity:config.capacity,refilledInterval:Math.floor(state.elapsed/config.refillSeconds)};
  state.economy.forestExpansion=forest.id;
}
/** Existing animals acquire new homes naturally; new-world initial groups spawn in their biomes. */
export function zoneForestAnimals(saved:WildlifeAuthority,forest:ForestExpansion|null|undefined,canStand:(p:Point)=>boolean,initial=false){
  if(!forest)return;const version=forest.drinkingWater?.length?forest.id+'-water-v1':forest.id;
  if(saved.habitatVersion===version)return;
  for(const species of ['deer','boar'] as const){
    const homes=forest.habitats[species].filter(canStand);if(!homes.length)throw Error(`No accessible forest habitat for ${species}`);
    let i=0;for(const animal of saved.ecology.animals)if(animal.species===species&&animal.hp>0){
      const home=homes[i++%homes.length];animal.home={...home};if(initial){animal.position={...home};animal.intent=null;}
    }
    for(const [index,home] of homes.entries()){
      const id=`forest-forage-${species}-${index}`;
      const patch=saved.ecology.food.find(p=>p.id===id);if(patch)patch.position={...home};else saved.ecology.food.push({id,position:{...home},capacity:40,remaining:40,readyAt:0});
    }
  }
  for(const [i,point] of (forest.drinkingWater??[]).filter(canStand).entries()){
    const id=`forest-water-${i}`,patch=saved.ecology.water.find(p=>p.id===id);if(patch)patch.position={...point};else saved.ecology.water.push({id,position:{...point},capacity:160,remaining:160,readyAt:0});
  }
  saved.habitatVersion=version;
}
