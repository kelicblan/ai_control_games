import {describe,it,expect} from 'vitest';
import {createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {validWorldState} from '../src/games/camp/world/state';
import {worldCanTraverse,moveWorldBody} from '../src/games/camp/world/navigation';
import {SETTLEMENT_OUTLINE,SETTLEMENT_WALL_SEGMENTS,insideSettlement} from '../src/games/camp/world/settlement';
import {createSettlementGate} from '../src/scene/settlementGate';
import {restoreGameState} from '../src/games/camp/simulation/persistence';
import {advanceLord} from '../src/games/camp/simulation/lord';
describe('rectangular palisade and working gate',()=>{
 it('encloses a roughly 300m rectangular settlement with just one gate opening',()=>{
  expect(insideSettlement(-80,-75)).toBe(true);expect(insideSettlement(190,175)).toBe(true);
  expect(insideSettlement(220,55)).toBe(false);
  expect(Math.max(...SETTLEMENT_OUTLINE.map(p=>p.x))-Math.min(...SETTLEMENT_OUTLINE.map(p=>p.x))).toBe(310);
  expect(SETTLEMENT_WALL_SEGMENTS[0].start).toEqual({x:39,y:205});
  expect(SETTLEMENT_WALL_SEGMENTS.at(-1)!.end).toEqual({x:61,y:205});
  for(const {start,end} of SETTLEMENT_WALL_SEGMENTS){
   expect(start.x===end.x||start.y===end.y).toBe(true);
   expect(start.x===-105||start.x===205||start.y===-101||start.y===205).toBe(true);
  }
  for(let i=1;i<SETTLEMENT_WALL_SEGMENTS.length;i++)expect(SETTLEMENT_WALL_SEGMENTS[i].start.x).toBeCloseTo(SETTLEMENT_WALL_SEGMENTS[i-1].end.x);
  // Neither side of the entrance can bypass the gate through a gap.
  for(const x of [35,39,61,65])expect(worldCanTraverse({x,y:198},{x,y:212},17)).toBe(false);
 });
 it('toggles authoritative state and blocks passage only when closed',()=>{
  const game=createGame({seed:17});game.status='playing';
  expect(worldCanTraverse({x:50,y:198},{x:50,y:212},17,true)).toBe(true);
  const closed=issueCommand(game,{type:'gate-toggle'});
  expect(closed.world!.gateOpen).toBe(false);expect(validWorldState(closed.world,17)).toBe(true);
  expect(restoreGameState(closed)!.world!.gateOpen).toBe(false);
  expect(worldCanTraverse({x:50,y:198},{x:50,y:212},17,false)).toBe(false);
  const npc=structuredClone(closed.npcs[0]);npc.position={x:50,y:200};
  const moved=moveWorldBody(npc,{x:50,y:210},20,1,[],17,true,false);
  expect(moved.position.y).toBeLessThan(204);
  expect(issueCommand(closed,{type:'gate-toggle'}).world!.gateOpen).toBe(true);
  expect(game.world!.gateOpen).toBe(true);
  closed.lord!.position={x:50,y:202};closed.lord!.input={x:0,y:1};
  for(let i=0;i<10;i++)advanceLord(closed,.25);
  expect(closed.lord!.position.y).toBeLessThan(204);
 });
 it('refuses to close while a person occupies the swing area',()=>{
  const game=createGame({seed:17});game.status='playing';game.npcs[0].position={x:50,y:205};
  expect(issueCommand(game,{type:'gate-toggle'}).world!.gateOpen).toBe(true);
 });
 it('animates two solid leaves around opposite post pivots',()=>{
  const gate=createSettlementGate(0);gate.update(true,0);
  expect(gate.group.children[0].rotation.y).toBeCloseTo(Math.PI/2);
  expect(gate.group.children[1].rotation.y).toBeCloseTo(-Math.PI/2);
  for(let i=1;i<30;i++)gate.update(false,i*.1);
  expect(Math.abs(gate.group.children[0].rotation.y)).toBeLessThan(.001);
  gate.dispose();
 });
});
