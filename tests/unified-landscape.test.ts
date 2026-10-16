import {describe,it,expect} from 'vitest';
import {landscapeHeight,landscapeVertexHeight,landscapeCell,landscapeRoad,landscapeRiverX,landscapeRiverWidth,OUTBOUND_ROAD} from '../src/games/camp/world/landscape';
import {buildLandscapeGeometry} from '../src/scene/landscapeModel';
import {sampleCampSurface,CAMP_HOUSES,isOnBridge,bridgeAt} from '../src/games/camp/world/definition';
import {worldCanTraverse} from '../src/games/camp/world/navigation';

describe('authored unified starter landscape',()=>{
 it('joins all nine cottage thresholds to their lanes with a worn, grass-free forecourt',()=>{
  for(const house of CAMP_HOUSES.slice(1)){
   for(let dy=6;dy<=18;dy+=1)expect(landscapeRoad(house.center.x,house.center.y+dy),`${house.id} doorway gap at ${dy}`).toBeGreaterThan(.75);
   for(const dx of [-9,-5,0,5,9])for(const dy of [9,12,15])expect(sampleCampSurface({x:house.center.x+dx,y:house.center.y+dy},17).road,`${house.id} yard ${dx},${dy}`).toBeGreaterThan(.75);
   expect(landscapeRoad(house.center.x-24,house.center.y+6)).toBeLessThan(.1);
  }
 });
 it('has multiple bends and varying river width instead of a straight constant-width canal',()=>{
  const xs=Array.from({length:15},(_,i)=>landscapeRiverX(-140+i*20));
  const widths=Array.from({length:15},(_,i)=>landscapeRiverWidth(-140+i*20));
  expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThan(25);
  expect(Math.max(...widths)-Math.min(...widths)).toBeGreaterThan(4);
  expect(landscapeRiverX(270)).toBeCloseTo(50,8);
 });
 it('extends its curving outbound road continuously beyond the initially revealed region',()=>{
  expect(Math.hypot(OUTBOUND_ROAD.at(-1)!.x-50,OUTBOUND_ROAD.at(-1)!.y-55)).toBeGreaterThan(1100);
  for(const p of OUTBOUND_ROAD)expect(landscapeRoad(p.x,p.y)).toBeGreaterThan(.8);
  expect(new Set(OUTBOUND_ROAD.map(p=>p.x)).size).toBeGreaterThan(5);
 });
 it('keeps the entire outbound track dry except at its explicit bridge crossing',()=>{
  for(const p of OUTBOUND_ROAD)expect(sampleCampSurface(p,17).water&&!isOnBridge(p),`road at ${p.x},${p.y}`).toBe(false);
  for(let i=1;i<OUTBOUND_ROAD.length;i++)if(OUTBOUND_ROAD[i-1].y>=205)expect(worldCanTraverse(OUTBOUND_ROAD[i-1],OUTBOUND_ROAD[i],17),`outbound segment ${i}`).toBe(true);
 });
 it('grades both banks of regular bridges to the deck rather than leaving a step',()=>{
  for(const index of [-1,0,1]){
   const b=bridgeAt(index),left={x:b.point.x-b.halfLength-5,y:b.point.y},right={x:b.point.x+b.halfLength+5,y:b.point.y};
   expect(worldCanTraverse(left,right,17),`bridge ${index}`).toBe(true);
  }
 });
 it('samples the same triangles that are actually exported, including off-grid points',()=>{
  const x=-405.6,y=-361.5,cell=landscapeCell(x,y),fx=(x-cell.x)/cell.stepX,fy=(y-cell.y)/cell.stepY;
  const a=landscapeVertexHeight(cell.x,cell.y),b=landscapeVertexHeight(cell.x+cell.stepX,cell.y),c=landscapeVertexHeight(cell.x,cell.y+cell.stepY);
  expect(landscapeHeight(x,y)).toBeCloseTo(a+(b-a)*fx+(c-a)*fy,8);
  expect(sampleCampSurface({x,y},17).height).toBeCloseTo(landscapeHeight(x,y),8);
 });
 it('exports a connected terrain mesh with embedded roads rather than floating road rectangles',()=>{
  const geometry=buildLandscapeGeometry({min:-110,max:214,step:4});
  const position=geometry.getAttribute('position'),road=geometry.getAttribute('roadWear');
  expect(geometry.index!.count).toBe(81*81*6);
  expect(road.count).toBe(position.count);
  expect(Array.from(road.array).some(v=>v>.8)).toBe(true);
  for(let i=0;i<position.count;i+=47)expect(position.getY(i)).toBeCloseTo(landscapeVertexHeight(position.getX(i)+50,position.getZ(i)+50),4);
  geometry.dispose();
 });
 it('keeps every inhabited foundation dry and its raised manor grounded',()=>{
  for(const home of CAMP_HOUSES){expect(sampleCampSurface(home.center,17).water).toBe(false);expect(Number.isFinite(landscapeHeight(home.center.x,home.center.y))).toBe(true);}
  expect(landscapeHeight(50,-45)).toBeCloseTo(8-.045,4);
  expect(landscapeHeight(50,55)).toBeCloseTo(-.045,4);
 });
 it('joins the modeled riverbank to the waterline instead of leaving a dry trench below the water',()=>{
  for(const y of [-450,0,75,200]){
   const x=landscapeRiverX(y)+landscapeRiverWidth(y);
   expect(landscapeVertexHeight(x,y)).toBeCloseTo(sampleCampSurface({x:landscapeRiverX(y),y},17).waterLevel,5);
  }
 });
});
