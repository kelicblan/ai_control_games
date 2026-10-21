import test from 'node:test';
import assert from 'node:assert/strict';
import { REGION, VILLAGE, LANDMARKS, buildings, terrainAt, chunkAt, getChunk, isBlocked, sweepMove, resourceById, nearbyResources, atlas } from '../../src/games/camp/world/pixel/world.mjs';

test('区域比例是32km世界和180x160m村寨，而不是放大的图标', () => {
  assert.equal(REGION.width,32000); assert.equal(REGION.height,32000);
  assert.deepEqual([VILLAGE.width,VILLAGE.height],[180,160]);
  assert.equal(VILLAGE.width/REGION.width,0.005625);
  assert.equal(REGION.chunkMetres,128); assert.equal(REGION.tileMetres,2);
});
test('八座功能建筑、十一床容量，预留地不建成假建筑', () => {
  const list=buildings();assert.equal(list.length,8);
  assert.equal(list.filter(b=>b.kind==='house').length,5);
  assert.equal(list.reduce((n,b)=>n+(b.beds||0),0),11);
  for(const kind of ['hall','workshop','storehouse'])assert.equal(list.filter(b=>b.kind===kind).length,1);
  for(const b of list)assert.equal(isBlocked(b.x,b.y),true,b.id);
});
test('寨门是12米的可通行缺口，关闭时阻挡；旁侧围栏始终阻挡', () => {
  const {x,y}=VILLAGE.gate;
  assert.equal(isBlocked(x,y),false);assert.equal(isBlocked(x,y,{gateOpen:false}),true);
  assert.equal(isBlocked(x+20,y),true);
  const moved=sweepMove({x,y:y-4},{x:0,y:1},8,{});
  assert.ok(moved.y>y+3);
  assert.ok(sweepMove({x,y:y-4},{x:0,y:1},8,{gateOpen:false}).y<y);
});
test('所有房门、主要道路与公共活动区都有可站立空间',()=>{
  for(const b of buildings())assert.equal(isBlocked(b.door.x,b.door.y),false,b.id+' 门口');
  for(let y=VILLAGE.y-20;y<VILLAGE.y+125;y+=2)assert.equal(isBlocked(VILLAGE.x,y),false,'南北通道 '+y);
});
test('分块坐标与访问顺序稳定，严格处理负坐标和区界',()=>{
  assert.deepEqual(chunkAt(-.1,0),{x:-1,y:0});
  assert.deepEqual(chunkAt(128,255),{x:1,y:1});
  const a=getChunk(108,136);getChunk(107,136);assert.deepEqual(getChunk(108,136),a);
  assert.equal(a.tiles.length,4096);
  for(const t of a.tiles)assert.ok(Number.isInteger(t)&&t>=0&&t<REGION.palette.length);
  assert.throws(()=>getChunk(1.5,0));assert.throws(()=>getChunk(-1,0));assert.throws(()=>getChunk(250,0));
  assert.throws(()=>terrainAt(NaN,0));
});
test('四种开局资源都在500米内、可采集、ID可查且非随机刷新',()=>{
  const resources=nearbyResources(VILLAGE.x,VILLAGE.y,500);
  for(const kind of ['wood','stone','fiber','food'])assert.ok(resources.some(n=>n.resource===kind),kind);
  for(const n of resources.filter(n=>n.id.startsWith('starter:'))){
    assert.equal(isBlocked(n.x,n.y+4),false,n.id+' 采集接近点');
    assert.deepEqual(resourceById(n.id),n);
  }
});
test('西北只有一个已配置金矿，位置远离开局且矿石可实际访问',()=>{
  const mines=LANDMARKS.filter(p=>p.kind==='goldmine');assert.equal(mines.length,1);
  assert.ok(mines[0].x<8000&&mines[0].y<8000);
  assert.ok(Math.hypot(mines[0].x-VILLAGE.x,mines[0].y-VILLAGE.y)>10000);
  const gold=resourceById('mine:northwest:ore');assert.equal(gold.resource,'gold');
  assert.equal(isBlocked(gold.x,gold.y+4),false);
});
test('河流有不可通行水面，已定义桥梁提供同源通道',()=>{
  const bridge=LANDMARKS.find(p=>p.kind==='bridge');
  assert.equal(terrainAt(bridge.x,bridge.y).kind,'bridge');assert.equal(isBlocked(bridge.x,bridge.y),false);
  assert.equal(terrainAt(19400,20300).kind,'water');assert.equal(isBlocked(19400,20300),true);
});
test('扫掠不穿建筑，斜向速度归一，拒绝非有限输入',()=>{
  const b=buildings()[0],from={x:b.x-b.width/2-5,y:b.y};
  assert.ok(sweepMove(from,{x:1,y:0},60,{}).x<b.x-b.width/2);
  const p={x:VILLAGE.x,y:VILLAGE.y+110};
  const q=sweepMove(p,{x:1,y:1},4,{});assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<=4.001);
  assert.throws(()=>sweepMove(p,{x:Infinity,y:0},1,{}));
});
test('总览由真实坐标采样且与局部地形一致',()=>{
  const view=atlas(128);assert.equal(view.pixels.length,128*128);assert.equal(view.metresPerPixel,250);
  assert.equal(view.pixels[33*128+42],terrainAt(42.5*250,33.5*250).index);
  assert.throws(()=>atlas(4096));
});

test('局部鹰眼与权威采样一致，不复用概念图背景',async()=>{
  const {minimap}=await import('../../src/games/camp/world/pixel/world.mjs');
  const map=minimap(VILLAGE.x,VILLAGE.y);assert.equal(map.pixels.length,128*128);
  assert.equal(map.span,1024);assert.equal(map.pixels[64*128+64],terrainAt(map.x-512+64.5*8,map.y-512+64.5*8).index);
});

test('桥不是地图标签：可通行水面上有按米分段的木桥实体',()=>{
  const b=LANDMARKS.find(p=>p.id==='east-bridge');const c=chunkAt(b.x,b.y);
  assert.ok(getChunk(c.x,c.y).props.some(p=>p.kind==='bridge-horizontal'));
});
test('跨大量区域勘察后分块缓存仍有上限，旧块重新生成不改资源ID',async()=>{
  const {cacheStats}=await import('../../src/games/camp/world/pixel/world.mjs');const original=getChunk(108,136);
  for(let i=0;i<120;i++)getChunk(i,90);
  assert.ok(cacheStats().size<=96);assert.deepEqual(getChunk(108,136),original);
});

test('资源分区由地形实现：南部确实是平原、深林猎场确实在林中',()=>{
  assert.equal(terrainAt(12500,26800).kind,'grass');
  assert.ok(['forest','deepforest'].includes(terrainAt(27300,7200).kind));
  const stone=nearbyResources(7700,13200,120).filter(p=>p.id.startsWith('quarry:'));
  assert.equal(stone.length,6);assert.ok(stone.every(p=>p.resource==='stone'&&p.amount>=100));
});
