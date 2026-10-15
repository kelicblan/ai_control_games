import {describe,it,expect} from 'vitest';
import {CAMP_HOUSES,CAMP_CENTER,sampleCampSurface,riverCenter,riverHalfWidth,GATE_BRIDGE} from '../src/games/camp/world/definition';
import {SETTLEMENT_RADIUS,SETTLEMENT_GATE,SETTLEMENT_WALLS,settlementRoad,PLANTED_TREES} from '../src/games/camp/world/settlement';
import {getTaskDestination,TERRAIN} from '../src/games/camp/simulation/terrain';
import {createPhysics} from '../src/games/camp/simulation/physics';
import {NPC_IDS} from '../src/games/camp/simulation/types';
import {worldCanTraverse,moveWorldBody} from '../src/games/camp/world/navigation';
import {createGame} from '../src/games/camp/simulation/engine';
import {treeAt} from '../src/games/camp/world/definition';

describe('reference valley settlement',()=>{
 it('opens onto a designed main avenue, with houses on side lanes and deliberate planting',()=>{
  expect(SETTLEMENT_GATE.y).toBe(205);expect(SETTLEMENT_GATE.x).toBe(50);
  for(let y=-20;y<=205;y+=4){
   expect(settlementRoad(50,y)).toBeGreaterThan(.95);
   expect(CAMP_HOUSES.some(h=>h.id!=='lord-house'&&Math.abs(50-h.center.x)<h.half.x+20&&Math.abs(y-h.center.y)<h.half.y+5)).toBe(false);
  }
  for(const h of CAMP_HOUSES.slice(1))expect(settlementRoad(h.center.x,h.center.y+h.half.y+6)).toBeGreaterThan(.8);
  expect(PLANTED_TREES.length).toBeGreaterThan(8);
  for(const t of PLANTED_TREES){
   expect(settlementRoad(t.point.x,t.point.y)).toBe(0);
   expect(CAMP_HOUSES.some(h=>Math.abs(t.point.x-h.center.x)<h.half.x+6&&Math.abs(t.point.y-h.center.y)<h.half.y+6)).toBe(false);
  }
 });
 it('has a 300m enclosure, a grand manor and nine separate subject homes',()=>{
  expect(SETTLEMENT_RADIUS*2).toBe(300);expect(CAMP_HOUSES).toHaveLength(10);
  expect(CAMP_HOUSES[0].half.x).toBeGreaterThan(CAMP_HOUSES[1].half.x*1.8);
  const beds=NPC_IDS.map(id=>getTaskDestination('rest',id));
  expect(new Set(beds.map(p=>`${p.x}:${p.y}`)).size).toBe(9);
  for(const bed of beds)expect(CAMP_HOUSES.filter(h=>h.id!=='lord-house'&&Math.abs(bed.x-h.center.x)<h.half.x&&Math.abs(bed.y-h.center.y)<h.half.y)).toHaveLength(1);
 });
 it('blocks the continuous wall but keeps the gate and every home doorway traversable',()=>{
  const physics=createPhysics(TERRAIN);
  expect(physics.isWalkable(SETTLEMENT_GATE,true,.15)).toBe(true);
  for(const wall of SETTLEMENT_WALLS)expect(physics.isWalkable(wall.shape.center,true,.15)).toBe(false);
  for(const h of CAMP_HOUSES){
   expect(physics.isWalkable(h.beds[0],true,.15)).toBe(true);
   expect(worldCanTraverse({x:h.center.x,y:h.center.y+h.half.y+6},h.beds[0],42)).toBe(true);
  }
  expect(worldCanTraverse({x:SETTLEMENT_GATE.x,y:SETTLEMENT_GATE.y+15},{x:SETTLEMENT_GATE.x,y:SETTLEMENT_GATE.y-15},42)).toBe(true);
 });
 it('keeps the inhabited ground dry and provides a smooth raised manor approach',()=>{
  for(const h of CAMP_HOUSES)expect(sampleCampSurface(h.center,42).water).toBe(false);
  expect(sampleCampSurface(CAMP_HOUSES[0].center,42).height).toBeGreaterThan(6);
  expect(sampleCampSurface(CAMP_CENTER,42).height).toBeCloseTo(0,0);
  for(let y=-10;y<22;y++)expect(Math.abs(sampleCampSurface({x:50,y},42).height-sampleCampSurface({x:50,y:y+1},42).height)).toBeLessThan(.76);
  for(let y=-90;y<205;y+=5)expect(Math.hypot(riverCenter(y)-50,y-55)-riverHalfWidth(y)).toBeGreaterThan(SETTLEMENT_RADIUS+4);
 });
 it('connects the main gate to the opposite riverbank across a real north/south bridge',()=>{
  expect(worldCanTraverse({x:50,y:GATE_BRIDGE.point.y-25},{x:50,y:GATE_BRIDGE.point.y+25},42)).toBe(true);
  expect(worldCanTraverse({x:50,y:190},{x:50,y:230},42)).toBe(true);
 });
 it('physically walks out through the gate, over its bridge, and back without water contacts',()=>{
  const npc=createGame({seed:42}).npcs[0];npc.position={x:50,y:180};
  for(const target of [{x:50,y:310},{x:50,y:180}]){
   let arrived=false;
   for(let i=0;i<220&&!arrived;i++){
    const step=moveWorldBody(npc,target,12,.25,[],42,true);
    expect(step.contacts.some(c=>c.kind==='water')).toBe(false);npc.position=step.position;arrived=step.arrived;
   }expect(arrived).toBe(true);
  }
 });
 it('collides with every designed tree and with the visible forest immediately outside the wall',()=>{
  for(const t of PLANTED_TREES)expect(worldCanTraverse(t.point,t.point,42)).toBe(false);
  let found=false;
  for(let x=-9;x<14&&!found;x++)for(let y=-9;y<14&&!found;y++){
   const t=treeAt(x,y,42);if(!t)continue;const r=Math.hypot(t.point.x-50,t.point.y-55);
   if(r>165&&r<218){found=true;expect(worldCanTraverse(t.point,t.point,42)).toBe(false);}
  }expect(found).toBe(true);
 });
});
