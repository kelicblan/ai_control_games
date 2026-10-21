import {it,expect} from 'vitest';
import {createVillageState} from '../../src/games/camp/village/domain/state';
import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {initializeEconomy} from '../../src/games/camp/village/systems/resources';
import {initializeCombat} from '../../src/games/camp/village/systems/combat';
import {moveTowards} from '../../src/games/camp/village/systems/combat-actions';
import {createAnimalWorld,executeAnimalAction} from '../../src/games/camp/animals/engine';
import {steerStep} from '../../packages/world-core/src/steering';
it('a sealed actor never crosses walls, teleports or emits nonfinite positions',()=>{
 const from={x:0,y:0},memory={side:1 as const,until:0,blocked:0};for(let i=0;i<30;i++)expect(steerStep(from,{x:3,y:0},.2,i*.1,()=>false,memory)).toBeNull();expect(from).toEqual({x:0,y:0});expect(memory.blocked).toBe(30);
});
it('walks around a stationary companion without crossing its body',()=>{
 const rules=selectWorldRules('village-v1','p4-social-content-v1');
 const s=createVillageState(rules,{id:'steering-test',classification:'experiment',worldId:'steering-test',seed:17,ruleVersion:rules.ruleVersion,inventory:{food:30},actors:[{archetypeId:'W001',instanceId:'worker',initial:{position:{x:-3,y:0}}}]});
 initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:50});s.actors.player.position={x:0,y:0};const p=s.actors.worker.position;
 let lateral=0;for(let i=0;i<100;i++){s.elapsed=i*.1;moveTowards(s,p,{x:3,y:0},2,.1);expect(Math.hypot(p.x,p.y)).toBeGreaterThanOrEqual(.55-1e-8);lateral=Math.max(lateral,Math.abs(p.y));}
 expect(lateral).toBeGreaterThan(.55);expect(Math.hypot(p.x-3,p.y)).toBeLessThan(.3);
});
it('an animal turns around a finite wall and reaches its original goal',()=>{
 const w=createAnimalWorld(17,[{x:-3,y:0}]);const a=w.animals[0];
 const canMove=(from:{x:number;y:number},to:{x:number;y:number})=>{for(let i=0;i<=20;i++){const x=from.x+(to.x-from.x)*i/20,y=from.y+(to.y-from.y)*i/20;if(x>=-.2&&x<=.2&&Math.abs(y)<=1)return false;}return true;};
 let lateral=0;for(let i=0;i<200;i++){w.time=i*.1;const before={...a.position};executeAnimalAction(w,a,{action:'explore',target:{x:3,y:0},targetId:null},.1,canMove);expect(canMove(before,a.position)).toBe(true);lateral=Math.max(lateral,Math.abs(a.position.y));}
 expect(lateral).toBeGreaterThan(1);expect(Math.hypot(a.position.x-3,a.position.y)).toBeLessThan(.3);
});
