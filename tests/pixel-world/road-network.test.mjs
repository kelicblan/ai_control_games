import test from 'node:test';
import assert from 'node:assert/strict';
import {REFERENCE_ROADS,inMountain} from '../../src/games/camp/world/pixel/reference-layout.mjs';
import {buildings,terrainAt,VILLAGE,ROADS,LANDMARKS} from '../../src/games/camp/world/pixel/world.mjs';
import {segmentDistance} from '../../packages/pixel-world-core/src/spatial.mjs';
function samples(roads,step=8){return roads.flatMap(r=>r.slice(1).flatMap((b,i)=>{const a=r[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step);return Array.from({length:n+1},(_,j)=>[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}));}
test('regional roads skirt village buildings and enter through the southern approach',()=>{
 for(const [x,y] of samples(ROADS)){
  for(const b of buildings())assert.ok(Math.abs(x-b.x)>b.width/2+1||Math.abs(y-b.y)>b.depth/2+1,`road inside ${b.id}`);
 }
 for(const [x,y] of samples(REFERENCE_ROADS)){
  assert.ok(Math.hypot(x-VILLAGE.x,y-VILLAGE.y)>=300,'regional trunk cuts through village');
  for(const b of buildings())assert.ok(Math.abs(x-b.x)>b.width/2+4||Math.abs(y-b.y)>b.depth/2+4,b.id);
 }
});
test('every road centreline has continuous dry ground or a real bridge, never mountain or open water',()=>{
 for(const [x,y] of samples(ROADS)){
  assert.ok(!inMountain(x,y),`mountain ${x},${y}`);
  assert.ok(terrainAt(x,y).walkable,`road interrupted ${x},${y}`);
 }
});
test('regional road ends connect to another road, a destination or the map boundary',()=>{
 for(const [index,r]of REFERENCE_ROADS.entries())for(const p of [r[0],r.at(-1)]){
  const boundary=Math.min(p[0],p[1],32000-p[0],32000-p[1])<1;
  const destination=LANDMARKS.some(l=>['goldmine','quarry','forest','pass'].includes(l.kind)&&Math.hypot(l.x-p[0],l.y-p[1])<100);
  const connected=REFERENCE_ROADS.some((other,i)=>i!==index&&other.some((b,j)=>j>0&&segmentDistance(...p,other[j-1],b)<1));
  assert.ok(boundary||destination||connected,`dead end ${index}: ${p}`);
 }
});
