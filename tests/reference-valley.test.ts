import {describe,it,expect} from 'vitest';
import {CAMP_HOUSES,sampleCampSurface,GATE_BRIDGE} from '../src/games/camp/world/definition';
import {LANDSCAPE_REVISION,landscapeHeight,landscapeRiverX,landscapeRiverWidth,landscapeWaterLevel} from '../src/games/camp/world/landscape';
import {SETTLEMENT_GATE} from '../src/games/camp/world/settlement';

describe('reference valley integrated geography',()=>{
 it('raises the inhabited village above its river without moving logical houses',()=>{
  expect(LANDSCAPE_REVISION).toBe(6);
  for(const home of CAMP_HOUSES){const s=sampleCampSurface(home.center,17);expect(s.water,home.id).toBe(false);expect(s.height,home.id).toBeGreaterThan(9);}
  expect(landscapeHeight(50,-45)-landscapeHeight(50,55)).toBeCloseTo(8,4);
  expect(landscapeHeight(SETTLEMENT_GATE.x,SETTLEMENT_GATE.y)).toBeGreaterThan(9);
 });
 it('has authored near-west, east and foreground ridges around the clearing',()=>{
  for(const p of [{x:-350,y:130},{x:390,y:45},{x:-330,y:430}])expect(landscapeHeight(p.x,p.y),JSON.stringify(p)).toBeGreaterThan(40);
 });
 it('keeps river water and bridge coordinates compatible with the existing world',()=>{
  expect(landscapeRiverX(GATE_BRIDGE.point.y)).toBeCloseTo(GATE_BRIDGE.point.x,8);
  for(const y of [-450,0,75,200])expect(sampleCampSurface({x:landscapeRiverX(y),y},17).water).toBe(true);
  for(const y of [-450,0,75,200])expect(landscapeWaterLevel(y)).toBeLessThan(1);
  expect(landscapeRiverWidth(55)).toBeGreaterThan(8);
 });
});
