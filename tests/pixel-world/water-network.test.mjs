import test from 'node:test';
import assert from 'node:assert/strict';
import {VILLAGE_CREEK,REFERENCE_RIVERS,inMountain} from '../../src/games/camp/world/pixel/reference-layout.mjs';
import {terrainAt,buildings} from '../../src/games/camp/world/pixel/world.mjs';
import {smoothLine,segmentDistance} from '../../packages/pixel-world-core/src/spatial.mjs';
test('regional river endpoints reach a map boundary or another river',()=>{
 for(const [index,r]of REFERENCE_RIVERS.entries())for(const p of [r.points[0],r.points.at(-1)]){
  const boundary=p[0]<=0||p[1]<=0||p[0]>=32000||p[1]>=32000;
  const joined=REFERENCE_RIVERS.some((other,i)=>i!==index&&smoothLine(other.points).some((b,j,line)=>j>0&&segmentDistance(...p,line[j-1],b)<other.width));
  assert.ok(boundary||joined,`orphan river ${index} at ${p}`);
 }
});
test('village stream rises in the mountain catchment and joins the regional river',()=>{
 assert.ok(inMountain(...VILLAGE_CREEK.points[0]),'stream source must belong to mountain catchment');
 const mouth=VILLAGE_CREEK.points.at(-1);
 assert.ok(REFERENCE_RIVERS.some(r=>smoothLine(r.points).some((p,i,a)=>i>0&&segmentDistance(...mouth,a[i-1],p)<r.width)),'orphan stream outlet');
});
test('village stream is continuous water or bridge and does not flood buildings',()=>{
 const line=smoothLine(VILLAGE_CREEK.points);
 for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8);for(let j=0;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,y=a[1]+(b[1]-a[1])*j/n;assert.ok(['water','bridge'].includes(terrainAt(x,y).kind));}}
 for(const b of buildings())assert.notEqual(terrainAt(b.x,b.y).kind,'water',b.id);
});
