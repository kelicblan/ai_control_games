import {describe,it,expect} from 'vitest';
import {createGame} from '../src/games/camp/simulation/engine';
import {restoreGameState,isValidGameState} from '../src/games/camp/simulation/persistence';
import {worldCanTraverse} from '../src/games/camp/world/navigation';
import {SETTLEMENT_WALLS} from '../src/games/camp/world/settlement';
import {CAMP_HOUSES,riverCenter} from '../src/games/camp/world/definition';

describe('settlement save migration',()=>{
 it('repairs an old v2 position submerged by the authored river without resetting health or history',()=>{
  const old=createGame();old.world!.settlementVersion=2;
  old.npcs[0].position={x:riverCenter(75),y:75};old.npcs[0].destination={...old.npcs[0].position};old.npcs[0].health=67;
  const next=restoreGameState(old)!;
  expect(next.world!.settlementVersion).toBe(8);expect(worldCanTraverse(next.npcs[0].position,next.npcs[0].position,next.seed)).toBe(true);
  expect(next.npcs[0].health).toBe(67);expect(next.events).toEqual(old.events);expect(next.wood).toBe(old.wood);
  expect(restoreGameState(next)).toEqual(next);
 });
 it('accepts the first settlement layout and retains historical palisade contact IDs after relocating the gate',()=>{
  const old=createGame();old.world!.settlementVersion=1;
  old.npcs[0].collision={hurtUntil:0,reactionUntil:0,objectCooldowns:{'palisade-48':0}};
  const next=restoreGameState(old)!;expect(next).not.toBeNull();expect(next.world!.settlementVersion).toBe(8);
  expect(next.npcs[0].collision).toEqual(old.npcs[0].collision);
 });
 it('repairs blocked local positions and commands once, retaining resources, history and remote locations',()=>{
  const old=createGame();delete old.world!.settlementVersion;
  old.npcs[0].position={...SETTLEMENT_WALLS[0].shape.center};old.npcs[0].destination={...CAMP_HOUSES[1].center,x:CAMP_HOUSES[1].center.x-12};
  old.npcs[0].manualTarget={...old.npcs[0].destination};old.npcs[0].worldRoute={target:{...old.npcs[0].destination},waypoints:[{...old.npcs[0].position}],stalledFor:0};
  old.npcs[1].position={x:4200,y:-3700};old.npcs[1].destination={x:4250,y:-3710};
  const before=structuredClone(old);expect(isValidGameState(old)).toBe(true);
  const next=restoreGameState(old)!;expect(next).not.toBeNull();
  expect(worldCanTraverse(next.npcs[0].position,next.npcs[0].position,next.seed)).toBe(true);
  expect(worldCanTraverse(next.npcs[0].destination,next.npcs[0].destination,next.seed)).toBe(true);
  expect(next.npcs[0].manualTarget).toEqual(next.npcs[0].destination);expect(next.npcs[0].worldRoute).toBeUndefined();
  expect(next.npcs[1].position).toEqual(before.npcs[1].position);expect(next.npcs[1].destination).toEqual(before.npcs[1].destination);
  for(const key of ['wood','food','fire','events','decisions','randomState','elapsed','social'] as const)expect(next[key]).toEqual(before[key]);
  expect(next.world!.exploration).toEqual(before.world!.exploration);expect(restoreGameState(next)).toEqual(next);
  expect(old).toEqual(before);
 });
 it('keeps legacy house collision IDs readable and replans old rest destinations to the assigned home',()=>{
  const old=createGame();delete old.world!.settlementVersion;
  old.npcs[0].action='rest';old.npcs[0].destination={x:64,y:81};
  old.npcs[0].collision={hurtUntil:0,reactionUntil:0,objectCooldowns:{'crew-house-front-west':0}};
  const next=restoreGameState(old)!;expect(next).not.toBeNull();
  expect(next.npcs[0].destination).toEqual(CAMP_HOUSES[1].beds[0]);
  expect(next.npcs[0].collision).toEqual(old.npcs[0].collision);
 });
});
