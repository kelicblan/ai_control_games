import {it,expect,vi} from 'vitest';
const {layout}=vi.hoisted(()=>({layout:{forestExpansion:null as unknown}}));
vi.mock('../../src/games/camp/world/newWorldProfile',()=>({newWorld:layout}));
import {createVillageState} from '../../src/games/camp/village/domain/state';
import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {initializeEconomy} from '../../src/games/camp/village/systems/resources';
import {validateEconomy} from '../../src/games/camp/village/domain/economy-validation';
import {importForestResources,zoneForestAnimals,type ForestExpansion} from '../../src/games/camp/world/forestExpansion';
import {createAnimalWorld,stepAnimals} from '../../src/games/camp/animals/engine';
import type {WildlifeAuthority} from '../../src/games/camp/animals/authority';
const forest:ForestExpansion={id:'forest-expansion-v1',clearings:[],habitats:{deer:[{x:100,y:-60}],boar:[{x:140,y:-100}]},resources:[{id:'forest-wood-1',kind:'wood',position:{x:110,y:-60},stand:{x:111,y:-60},capacity:12,recovery:2400},{id:'forest-berries-1',kind:'berries',position:{x:120,y:-60},stand:{x:121,y:-60},capacity:8,recovery:300}]};

it('imports finite reachable geography without restoring depleted sites or granting inventory',()=>{
  layout.forestExpansion=forest;const rules=selectWorldRules('village-v1','p4-social-content-v1');
  const s=createVillageState(rules,{id:'forest',classification:'experiment',worldId:'forest',seed:17,ruleVersion:rules.ruleVersion,inventory:{food:30},actors:[{archetypeId:'W001',instanceId:'worker'}]});
  initializeEconomy(s,rules);s.navigation={mode:'shared-world',routes:{}};
  const inventory=structuredClone(s.inventory),foodCount=Object.keys(s.economy!.foodSources!).length;
  importForestResources(s,rules,forest);expect(s.inventory).toEqual(inventory);expect(Object.keys(s.economy!.foodSources!)).toHaveLength(foodCount+1);
  const wood=s.economy!.nodes['forest-wood-1'],berries=s.economy!.foodSources!['forest-berries-1'];wood.remainingHp--;berries.remaining=0;
  const hp=wood.remainingHp;s.elapsed=1000;importForestResources(s,rules,forest);
  expect(wood.remainingHp).toBe(hp);expect(berries.remaining).toBe(0);expect(berries.position).toEqual(forest.resources[1].stand);expect(()=>validateEconomy(s,rules)).not.toThrow();
  berries.position.x++;expect(()=>validateEconomy(s,rules)).toThrow(/geography/);
});

it('zones deer and boar while preserving existing lives, positions and hunts',()=>{
  const saved:WildlifeAuthority={ecology:createAnimalWorld(17,[{x:0,y:0}]),hunt:null,operations:{}};
  const deer=saved.ecology.animals.find(a=>a.species==='deer')!,boar=saved.ecology.animals.find(a=>a.species==='boar')!;
  deer.hp=3;boar.hp=0;boar.carcass=8;const original={...deer.position};
  zoneForestAnimals(saved,forest,()=>true);expect(deer.home).toEqual(forest.habitats.deer[0]);expect(deer.position).toEqual(original);expect(deer.hp).toBe(3);expect(boar.hp).toBe(0);expect(boar.carcass).toBe(8);
  const count=saved.ecology.food.length;zoneForestAnimals(saved,forest,()=>true);expect(saved.ecology.food).toHaveLength(count);
  const fresh:WildlifeAuthority={ecology:createAnimalWorld(17,[{x:0,y:0}]),hunt:null,operations:{}};zoneForestAnimals(fresh,forest,()=>true,true);
  expect(fresh.ecology.animals.filter(a=>a.species==='deer').every(a=>a.position.x===100)).toBe(true);expect(fresh.ecology.animals.filter(a=>a.species==='boar').every(a=>a.position.x===140)).toBe(true);
});

it('expanded forest animals find water and survive ten simulated minutes without refilling depleted water on re-import',()=>{
  const geography={...forest,drinkingWater:[{x:102,y:-60},{x:142,y:-100}]};
  const saved:WildlifeAuthority={ecology:createAnimalWorld(17,[{x:0,y:0}]),hunt:null,operations:{}};
  saved.ecology.animals=saved.ecology.animals.filter(a=>a.id==='animal-deer-0'||a.id==='animal-boar-0');
  zoneForestAnimals(saved,geography,()=>true,true);for(const a of saved.ecology.animals){a.thirst=95;a.hunger=0;}
  const water=saved.ecology.water.find(p=>p.id==='forest-water-0')!;water.remaining=100;
  zoneForestAnimals(saved,geography,()=>true);expect(water.remaining).toBe(100);
  for(let i=0;i<6000;i++)stepAnimals(saved.ecology,[],.1,()=>true);
  expect(saved.ecology.metrics.drank).toBeGreaterThan(10);expect(saved.ecology.animals.filter(a=>a.id==='animal-deer-0'||a.id==='animal-boar-0').every(a=>a.hp>0&&a.thirst<95)).toBe(true);
});

it('migrates earlier forest forage locations with homes while preserving consumption and recovery',()=>{
  const saved:WildlifeAuthority={ecology:createAnimalWorld(17,[{x:0,y:0}]),hunt:null,operations:{},habitatVersion:'forest-expansion-v1'};
  saved.ecology.food.push({id:'forest-forage-boar-0',position:{x:140,y:-160},capacity:40,remaining:0,readyAt:180});
  const patch=saved.ecology.food.at(-1)!;zoneForestAnimals(saved,{...forest,drinkingWater:[{x:142,y:-100},{x:102,y:-60}]},()=>true);
  expect(patch.position).toEqual(forest.habitats.boar[0]);expect(patch.remaining).toBe(0);expect(patch.readyAt).toBe(180);
});
