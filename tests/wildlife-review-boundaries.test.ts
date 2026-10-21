import {it,expect} from 'vitest';
import {createAnimalWorld,executeAnimalAction,stepAnimals} from '../src/games/camp/animals/engine';
import {stepTide,animalHostile} from '../src/games/camp/animals/tide';
import {prepareCurriculumEpisode} from '../src/games/camp/village/scenarios/curriculum';
import {moveTowards} from '../src/games/camp/village/systems/combat-actions';
import {DatabaseSync} from 'node:sqlite';import {VillageAnimals} from '../scripts/world/village-animals';
it('retreating hungry members cannot execute stale human pursuit but may retaliate',()=>{
 const w=createAnimalWorld(1,[{x:0,y:0}]),a=w.animals.find(a=>a.species==='boar')!;stepTide(w,{gate:{x:20,y:0},approach:{x:25,y:0},humans:[]});w.tide!.memberIds=[a.id];w.tide!.phase='retreating';a.hunger=90;a.position={x:0,y:0};const h={id:'human',position:{x:1,y:0},hp:100,attack:1,defense:0,range:1};let hits=0;
 expect(animalHostile(w,a,h.id)).toBe(false);executeAnimalAction(w,a,{action:'chase',targetId:h.id,target:h.position},.1,()=>true,[h]);expect(a.position.x).toBe(0);executeAnimalAction(w,a,{action:'attack',targetId:h.id,target:h.position},.1,()=>true,[h],()=>hits++);expect(hits).toBe(0);a.attacker=h.id;a.alertUntil=10;expect(animalHostile(w,a,h.id)).toBe(true);
});
it('physical body obstruction does not remove terrain-visible candidates',()=>{
 const w=createAnimalWorld(2,[{x:0,y:0}]);w.animals=w.animals.slice(0,1);const a=w.animals[0];a.position={x:0,y:0};let observed=false;stepAnimals(w,[],.1,()=>true,o=>{observed=o.candidates.some(c=>c.action==='explore');return o.candidates.find(c=>c.action==='explore')!;},'teacher',undefined,()=>false);expect(observed).toBe(true);expect(a.position).toEqual({x:0,y:0});
});
it('human movement respects living animal bodies',()=>{
 const s=prepareCurriculumEpisode('tactical','melee',1001);s.combat!.enemies={};const p=s.actors.worker.position,w=createAnimalWorld(1,[p]);w.animals=w.animals.slice(0,1);w.animals[0].position={x:p.x+.6,y:p.y};s.wildlife={ecology:w,hunt:null,operations:{}};moveTowards(s,p,{x:p.x+3,y:p.y},2,.1);expect(Math.hypot(p.x-w.animals[0].position.x,p.y-w.animals[0].position.y)).toBeGreaterThanOrEqual(.55-1e-8);
});
it('player hunting travel cannot pass through another person',()=>{const s=prepareCurriculumEpisode('tactical','melee',1001);s.combat!.enemies={};s.economy!.fence.hp=0;const actor=s.actors[s.playerId],peer=Object.values(s.actors).find(a=>a.id!==actor.id)!,start={...actor.position};peer.position={x:start.x+.6,y:start.y};const w=createAnimalWorld(1,[start]);w.animals=w.animals.slice(0,1);const a=w.animals[0];a.hp=0;a.carcass=5;a.deathAt=0;a.position={x:start.x+3,y:start.y};s.wildlife={ecology:w,hunt:null,operations:{}};const db=new DatabaseSync(':memory:'),host=new VillageAnimals(db);try{host.hunt(s,a.id,'review-hunt');host.step(s);expect(Math.hypot(actor.position.x-peer.position.x,actor.position.y-peer.position.y)).toBeGreaterThanOrEqual(.55-1e-8);}finally{db.close();}});
