import {describe,it,expect} from 'vitest';
import {CAMP_HOUSES} from '../src/games/camp/world/definition';
import {worldCanTraverse,moveWorldBody} from '../src/games/camp/world/navigation';
import {createGame} from '../src/games/camp/simulation/engine';
import {restoreGameState} from '../src/games/camp/simulation/persistence';
import {getTaskDestination} from '../src/games/camp/simulation/terrain';
import {isAtCamp} from '../src/games/camp/simulation/constants';
import {VILLAGE_FACILITIES,VILLAGE_PLAZA,FACILITY_WALLS,villageClearance} from '../src/games/camp/world/villageLayout';
import {insideSettlement,PLANTED_TREES} from '../src/games/camp/world/settlement';
import {landscapeRoad} from '../src/games/camp/world/landscape';

describe('functional village layout',()=>{
 it('classifies the walled village as safe while keeping the external bridge and wilderness outside',()=>{
  const npc=createGame().npcs[4];
  for(const point of [getTaskDestination('eat',npc.id),...VILLAGE_FACILITIES.filter(f=>f.wallHeight>0).map(f=>f.center),...CAMP_HOUSES.map(h=>h.beds[0])]){
   npc.position={...point};expect(isAtCamp(npc),JSON.stringify(point)).toBe(true);
  }
  for(const point of [VILLAGE_PLAZA.center,VILLAGE_FACILITIES[0].center,{x:170,y:160}]){npc.position={...point};expect(isAtCamp(npc)).toBe(true);}
  for(const point of [{x:50,y:220},{x:-150,y:55},{x:220,y:0}]){npc.position={...point};expect(isAtCamp(npc)).toBe(false);}
 });
 it('has six cottages west and three east while keeping five original housing identities',()=>{
  const homes=CAMP_HOUSES.slice(1);
  expect(homes).toHaveLength(9);
  expect(homes.filter(h=>h.center.x<50)).toHaveLength(6);
  expect(homes.filter(h=>h.center.x>50)).toHaveLength(3);
  expect(homes.slice(0,5).map(h=>h.id)).toEqual(['crew-house','subject-house-2','subject-house-3','subject-house-4','subject-house-5']);
 });
 it('keeps the plaza and training center open and gives public buildings hollow enterable walls',()=>{
  for(const [a,b] of [[{x:50,y:65},{x:50,y:165}],[{x:110,y:-25},{x:180,y:-25}],[{x:-20,y:20},{x:-20,y:-1}],[{x:-20,y:90},{x:-20,y:65}]])
   expect(worldCanTraverse(a,b,17)).toBe(true);
  expect(worldCanTraverse({x:-40,y:-5},{x:-20,y:-5},17)).toBe(false);
  expect(worldCanTraverse({x:-40,y:65},{x:-20,y:65},17)).toBe(false);
 });
 it('blocks low training perimeter walls including the solid north side while keeping the south entry open',()=>{
  expect(worldCanTraverse({x:90,y:-25},{x:110,y:-25},17)).toBe(false);
  expect(worldCanTraverse({x:185,y:-25},{x:200,y:-25},17)).toBe(false);
  expect(worldCanTraverse({x:145,y:28},{x:145,y:-25},17)).toBe(true);
  expect(worldCanTraverse({x:145,y:-78},{x:145,y:-25},17)).toBe(false);
 });
 it('preserves historical contacts with removed planted trees during migration',()=>{
  const old=createGame();old.world!.settlementVersion=4;
  old.npcs[0].collision={hurtUntil:0,reactionUntil:0,objectCooldowns:{'planted-tree-16':0}};
  const next=restoreGameState(old);
  expect(next).not.toBeNull();expect(next!.npcs[0].collision).toEqual(old.npcs[0].collision);
 });
 it.each([5,6] as const)('migrates the interim v%s snapshot against calibrated public walls and supply targets once',version=>{
  const old=createGame();old.world!.settlementVersion=version;
  old.npcs[0].collision={hurtUntil:0,reactionUntil:0,objectCooldowns:{'training-ground-back-west':0,'training-ground-back-east':0}};
  const wall=FACILITY_WALLS.find(w=>w.id==='warehouse-west')!;
  old.npcs[0].position={...wall.center};old.lord!.position={...wall.center};
  old.npcs[1].action='eat';old.npcs[1].destination={x:-8,y:22};
  const next=restoreGameState(old)!;
  expect(next.world!.settlementVersion).toBe(8);
  expect(next.npcs[1].destination).toEqual(getTaskDestination('eat',old.npcs[1].id));
  for(const point of [next.npcs[0].position,next.lord!.position])expect(worldCanTraverse(point,point,next.seed)).toBe(true);
  expect(next.events).toEqual(old.events);expect(next.wood).toBe(old.wood);
  expect(restoreGameState(next)).toEqual(next);
 });
 it('fits all footprints within the enclosure and keeps planted trees outside functional zones',()=>{
  for(const zone of [...CAMP_HOUSES,...VILLAGE_FACILITIES,VILLAGE_PLAZA])
   for(const dx of [-1,1])for(const dy of [-1,1])expect(insideSettlement(zone.center.x+dx*zone.half.x,zone.center.y+dy*zone.half.y)).toBe(true);
  for(const tree of PLANTED_TREES)expect(villageClearance(tree.point.x,tree.point.y,6)).toBe(false);
  for(const zone of [...VILLAGE_FACILITIES,VILLAGE_PLAZA]){
   expect(villageClearance(zone.center.x,zone.center.y)).toBe(true);
   expect(landscapeRoad(zone.center.x,zone.center.y)).toBeGreaterThan(.95);
  }
 });
 it('migrates v4 wall overlaps, moved beds and lord safely without altering progress',()=>{
  const old=createGame({seed:17});old.world!.settlementVersion=4;
  old.npcs[0].position={x:-37,y:-5};old.npcs[0].destination={x:-35,y:-3};old.npcs[0].action='rest';
  old.npcs[0].worldRoute={target:{x:-35,y:-3},waypoints:[{x:0,y:0}],stalledFor:0};old.npcs[0].progress=.2;
  old.lord!.position={x:-37,y:65};old.wood=91;old.npcs[0].health=62;old.npcs[4].alive=false;
  const next=restoreGameState(old)!;
  expect(next.world!.settlementVersion).toBe(8);
  expect(next.npcs[0].destination).toEqual(CAMP_HOUSES[1].beds[0]);
  expect(next.npcs[0].worldRoute).toBeUndefined();
  expect(next.npcs[0].progress).toBe(.2);
  for(const p of [next.lord!.position,next.npcs[0].position])expect(worldCanTraverse(p,p,17)).toBe(true);
  expect(next.wood).toBe(91);expect(next.npcs[0].health).toBe(62);expect(next.npcs[4].alive).toBe(false);
  expect(next.events).toEqual(old.events);expect(next.decisions).toEqual(old.decisions);
  expect(restoreGameState(next)).toEqual(next);
 });
 it('retargets old meal and supply return stations without resetting action progress or inventory',()=>{
  const old=createGame();old.world!.settlementVersion=4;
  for(const [i,action] of ['eat','camp','rest'].entries()){
   const person=old.npcs[i];person.action=action as 'eat'|'camp'|'rest';person.destination={x:32,y:72};person.progress=.2;person.actionDuration=6;
   person.inventory={wood:i===0?0:3,food:0};
  }
  const next=restoreGameState(old)!;
  for(let i=0;i<3;i++){
   expect(next.npcs[i].destination).toEqual(getTaskDestination(next.npcs[i].action!,next.npcs[i].id,i>0));
   expect(next.npcs[i].progress).toBe(.2);expect(next.npcs[i].inventory).toEqual(old.npcs[i].inventory);
  }
 });
 it.each(CAMP_HOUSES.slice(1))('walks from the plaza into $id including outer corners',h=>{
   const npc=createGame({seed:17}).npcs[0];npc.position={x:50,y:105};
   for(let i=0;i<200;i++){const step=moveWorldBody(npc,h.beds[0],12,.25,[],17);npc.position=step.position;if(step.arrived)break;}
   expect(Math.hypot(npc.position.x-h.beds[0].x,npc.position.y-h.beds[0].y),h.id).toBeLessThan(.3);
 });
});
