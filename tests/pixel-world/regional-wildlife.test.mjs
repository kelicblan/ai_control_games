import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalGroup,activateRegionalWildlife,observeRegionalWildlife,MAX_ACTIVE_REGIONS} from '../../scripts/world/pixel-wildlife.ts';
import {createAnimalWorld} from '../../src/games/camp/animals/engine.ts';
import {isBlocked,VILLAGE} from '../../src/games/camp/world/pixel/world.mjs';
const create=()=>({ecology:createAnimalWorld(20261021,[{x:VILLAGE.x+240,y:VILLAGE.y+100}]),hunt:null,operations:{}});
test('regional wildlife is deterministic, distributed on safe land, with no predators at camp',()=>{
 let total=0;const ids=new Set();for(const [x,y] of [[107,136],[108,137],[96,127],[136,144],[213,56],[97,209],[213,209]]){
  const group=regionalGroup(20261021,x,y);assert.deepEqual(group,regionalGroup(20261021,x,y));total+=group.length;
  for(const a of group){assert.ok(!ids.has(a.id));ids.add(a.id);assert.equal(isBlocked(a.position.x,a.position.y,{gateOpen:true}),false);if(Math.hypot(a.home.x-VILLAGE.x,a.home.y-VILLAGE.y)<700)assert.ok(!['bear','tiger','boar'].includes(a.species));}
 }assert.ok(total>=20,`only ${total} animals across landmarks`);
});
test('depleted groups and injured individuals survive leaving, JSON restart, and return',()=>{
 let v=create();const home={x:13824,y:17408};activateRegionalWildlife(v,[home]);const animal=v.ecology.animals.find(a=>a.region);assert.ok(animal);animal.hp=0;animal.carcass=0;animal.deathAt=v.ecology.time;animal.mode='dead';const id=animal.id;
 activateRegionalWildlife(v,[{x:27000,y:27000}]);v=JSON.parse(JSON.stringify(v));activateRegionalWildlife(v,[home]);assert.equal(v.ecology.animals.find(a=>a.id===id).hp,0);
 const visible=observeRegionalWildlife(v,animal.home,100);assert.ok(!visible.some(a=>a.id===id));
});
test('active populations and observations are bounded; distant animals are authoritative stable identities',()=>{
 const v=create();activateRegionalWildlife(v,Array.from({length:10},(_,i)=>({x:3000+i*2400,y:16000})));
 assert.ok(v.pixelRegions.active.length<=MAX_ACTIVE_REGIONS);assert.ok(v.ecology.animals.length<=220);
 const center={x:27300,y:7200},first=observeRegionalWildlife(v,center,500);assert.ok(first.length>5);assert.ok(first.length<=220);
 v.ecology.time+=10;const second=observeRegionalWildlife(v,center,500),shared=second.filter(a=>first.some(b=>b.id===a.id));assert.ok(shared.length>=first.length*.9);assert.ok(shared.some(a=>a.position.x!==first.find(b=>b.id===a.id).position.x));
});
test('external region storage bounds the hot checkpoint and retains depleted individuals',()=>{
 const records=new Map(),store={read:id=>records.has(id)?structuredClone(records.get(id)):undefined,write:(id,animals)=>records.set(id,structuredClone(animals))};
 const v=create(),home={x:13824,y:17408};activateRegionalWildlife(v,[home],store);const target=v.ecology.animals.find(a=>a.region);target.hp=0;target.carcass=0;target.mode='dead';target.deathAt=0;
 activateRegionalWildlife(v,[{x:27000,y:27000}],store);assert.ok(records.size>0);assert.deepEqual(v.pixelRegions.dormant,{});
 activateRegionalWildlife(v,[home],store);assert.equal(v.ecology.animals.find(a=>a.id===target.id).hp,0);assert.deepEqual(v.pixelRegions.dormant,{});
});
