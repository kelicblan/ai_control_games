import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {point,REFERENCE_RIVERS,MOUNTAIN_MASKS,FOREST_MASKS,contains} from '../../src/games/camp/world/pixel/reference-layout.mjs';
import {VILLAGE,LANDMARKS,terrainAt,overviewProps,viewportRaster,nearbyResources,isBlocked} from '../../src/games/camp/world/pixel/world.mjs';
test('reference quarry is reachable ground and each finite stone deposit has a safe approach',()=>{
 const quarry=LANDMARKS.find(p=>p.id==='quarry');assert.equal(terrainAt(quarry.x,quarry.y).walkable,true);
 const stone=nearbyResources(quarry.x,quarry.y,90).filter(p=>p.id.startsWith('quarry:'));assert.equal(stone.length,6);
 for(const p of stone)assert.equal(isBlocked(p.x,p.y+4),false,p.id);
});
test('approved design anchors and traced river control points use the same north-up coordinates',()=>{
 assert.deepEqual([VILLAGE.x,VILLAGE.y],point([441,526]));
 for(const river of REFERENCE_RIVERS)for(const [x,y] of river.points.filter(([x,y])=>x>0&&y>0&&x<32000&&y<32000))assert.ok(['water','bridge'].includes(terrainAt(x,y).kind),`${x},${y}`);
 const mine=LANDMARKS.find(p=>p.id==='goldmine-nw');assert.deepEqual([mine.x,mine.y],point([96,180]));
 assert.ok(contains(...point([96,130]),MOUNTAIN_MASKS[0]));assert.ok(contains(...point([869,224]),FOREST_MASKS[0]));
});
test('village buildings, walls and bridges have a representation at every tested zoom',()=>{
 for(const span of [512,1024,2048,4096,8192,16000,32000]){
  const x=Math.max(0,Math.min(32000-span,VILLAGE.x-span/2)),y=Math.max(0,Math.min(32000-span,VILLAGE.y-span/2));
  const props=overviewProps(x,y,span,512),ids=new Set(props.map(p=>p.id));
  for(const id of ['lord-hall','house-west-1','house-east-3','workshop','storehouse','gate','well','hearth'])assert.ok(ids.has(id),`${span}: ${id}`);
  if(span>1024)assert.equal(props.find(p=>p.id==='lord-hall').mapLayer,1,'cartographic village draws above neighbouring mountain aggregates');
  assert.ok(props.some(p=>p.kind==='fence'));assert.ok(props.some(p=>p.kind==='oak'||p.kind==='pine'||p.kind==='scenery-tree'));
  assert.ok(props.length<40000,'bounded merged representation');
 }
});
test('remote and detailed representations share village identity and keep loaded chunks visible',()=>{
 const raster=viewportRaster(VILLAGE.x,VILLAGE.y,2048,512);assert.ok(raster.props.some(p=>p.id==='lord-hall'));assert.equal(raster.pixels.length,512*512);
 const source=readFileSync(new URL('../../native/CampMind.Unity/Assets/CampMind/PixelWorld/PixelWorldView.cs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/SetDetailVisible\(!OverviewActive\)/);assert.match(source,/SetDetailVisible\(true\)/);
});
