import test from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGE, LANDMARKS, buildings, terrainAt, getChunk, isBlocked } from '../../src/games/camp/world/pixel/world.mjs';

const {x,y}=VILLAGE;
const villageProps=()=>{const all=[];for(let cy=Math.floor(y/128)-2;cy<=Math.floor(y/128)+2;cy++)for(let cx=Math.floor(x/128)-2;cx<=Math.floor(x/128)+2;cx++)all.push(...getChunk(cx,cy).props);return all;};
test('原图建筑占比：议事厅约寨宽三分之一，民居至少六分之一',()=>{
  const list=buildings();assert.ok(list.find(p=>p.kind==='hall').visualWidth/VILLAGE.width>=.30);
  for(const b of list.filter(p=>p.kind==='house'))assert.ok(b.visualWidth/VILLAGE.width>=.17);
});
test('参考村寨北墙与建筑脚下不被河流切穿，村北桥紧邻村寨',()=>{
  for(let dx=-86;dx<=86;dx+=2)assert.notEqual(terrainAt(x+dx,y-80).kind,'water');
  for(const b of buildings())assert.equal(terrainAt(b.x,b.y).walkable,true,b.id);
  const bridge=LANDMARKS.find(p=>p.id==='creek-bridge');
  assert.ok(Math.hypot(bridge.x-x,bridge.y-y)<260);
  assert.equal(terrainAt(bridge.x,bridge.y).kind,'bridge');
});
test('公共活动区具有成组生活设施与绿化，不以假资源冒充生产',()=>{
  const props=villageProps();
  for(const kind of ['garden','woodpile','crate','bench','flowers'])assert.ok(props.some(p=>p.kind===kind),kind);
  const details=props.filter(p=>p.id.startsWith('village-detail:'));
  assert.ok(details.length>=35);
  assert.ok(details.every(p=>!p.resource));
  assert.equal(new Set(props.map(p=>p.id)).size,props.length);
});
test('寨门、中央公共活动区和所有建筑门口通过实际地表连通',()=>{
  const visited=new Set(),todo=[[0,78]],targets=buildings().map(b=>[Math.round(b.door.x-x),Math.round(b.door.y-y)]);
  for(let i=0;i<todo.length;i++){
    const [dx,dy]=todo[i];if(Math.abs(dx)>88||Math.abs(dy)>79)continue;
    const key=dx+','+dy;if(visited.has(key)||isBlocked(x+dx,y+dy))continue;
    visited.add(key);for(const [a,b]of [[1,0],[-1,0],[0,1],[0,-1]])todo.push([dx+a,dy+b]);
  }
  assert.ok(visited.has('0,0'));
  for(const [dx,dy]of targets)assert.ok(visited.has(dx+','+dy),'door '+dx+','+dy);
});
test('图集地形边缘采样跨区块与权威格一致，装饰不突破协议上限',()=>{
  const a=getChunk(108,135),b=getChunk(109,135);
  assert.equal(a.halo.length,66*66);
  for(let row=0;row<64;row++)assert.equal(a.halo[(row+1)*66+65],b.tiles[row*64]);
  for(let cy=Math.floor(y/128)-2;cy<=Math.floor(y/128)+2;cy++)for(let cx=Math.floor(x/128)-2;cx<=Math.floor(x/128)+2;cx++)assert.ok(getChunk(cx,cy).props.length<=512);
});
test('村寨近郊以黄绿阔叶树为主，混合金黄树冠并保留少量针叶树',()=>{
  const trees=[];
  for(let cy=Math.floor(y/128)-3;cy<=Math.floor(y/128)+3;cy++)for(let cx=Math.floor(x/128)-3;cx<=Math.floor(x/128)+3;cx++)for(const p of getChunk(cx,cy).props)
    if(Math.hypot(p.x-x,p.y-y)<300&&['pine','oak','scenery-tree','scenery-tree-gold','scenery-pine','ornamental-tree'].includes(p.kind))trees.push(p);
  const broadleaf=trees.filter(p=>['oak','scenery-tree','scenery-tree-gold','ornamental-tree'].includes(p.kind));
  assert.ok(broadleaf.length/trees.length>=.7);
  assert.ok(trees.some(p=>p.kind==='scenery-tree-gold'));
  assert.ok(trees.some(p=>p.kind==='scenery-pine'));
});
test('东南湿地包含实际不可通行的水洼与陆地芦苇带',()=>{
  let water=0,land=0;
  for(let dy=-180;dy<=180;dy+=12)for(let dx=-180;dx<=180;dx+=12){const t=terrainAt(27300+dx,26800+dy);if(t.kind==='water')water++;if(t.kind==='wetland')land++;}
  assert.ok(water>50&&land>100,{water,land});
});
