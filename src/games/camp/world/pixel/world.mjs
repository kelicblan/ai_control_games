import {VILLAGE_SPRING,LOCAL_ROADS,VILLAGE_CREEK,REFERENCE_CROSSINGS,VILLAGE_ANCHOR,REFERENCE_LANDMARKS,REFERENCE_RIVERS,REFERENCE_ROADS,point,inMountain,inForest,inWetland,inLake} from './reference-layout.mjs';
import {segmentDistance,smoothLine,lineIndex} from '../../../../../packages/pixel-world-core/src/spatial.mjs';
/**
 * 一寨之主：二维地图的唯一几何来源。
 * 坐标单位为米，x向东、y向南。画面、碰撞、资源、总览都调用这里；
 * 禁止在Unity重新随机生成一套“看起来一样”的地形。该模块没有DOM或Unity依赖。
 */
export const REGION = Object.freeze({
  id:'pixel-region-v1', generator:1, seed:20261021, width:32000, height:32000,
  chunkMetres:128, tileMetres:2, cells:64, cacheLimit:96,
  palette:['#71a24d','#4c793c','#315a36','#8f9270','#656b66','#426e78','#b0a36c','#a08a5e','#6c7f55','#d3dbd4'],
});
export const VILLAGE = Object.freeze({
  x:VILLAGE_ANCHOR[0],y:VILLAGE_ANCHOR[1],width:180,height:160,
  gate:Object.freeze({x:VILLAGE_ANCHOR[0],y:VILLAGE_ANCHOR[1]+80,width:12}),
  spawn:Object.freeze({x:VILLAGE_ANCHOR[0],y:VILLAGE_ANCHOR[1]+30}),
});
const namedBridgeIds=new Set();
export const LANDMARKS = Object.freeze([
  {id:'village',name:'初始村寨',kind:'village',x:13824,y:17408},
  {id:'goldmine-nw',name:'西北金矿',kind:'goldmine',x:3600,y:3600},
  {id:'quarry',name:'丘陵石场',kind:'quarry',x:7700,y:13200},
  {id:'north-pass',name:'北部山口',kind:'pass',x:14400,y:5000},
  {id:'near-forest',name:'近郊林地',kind:'forest',x:12400,y:16300},
  {id:'deep-forest',name:'深林猎场',kind:'forest',x:27300,y:7200},
  {id:'meadow',name:'河谷草甸',kind:'meadow',x:17400,y:18400},
  {id:'plain',name:'南部平原',kind:'plain',x:12500,y:26800},
  {id:'wetland',name:'东南湿地',kind:'wetland',x:27300,y:26800},
  {id:'east-bridge',name:'河谷木桥',kind:'bridge',x:19400,y:20000,width:250,depth:14},
  {id:'creek-bridge',name:'村北木桥',kind:'bridge',x:13934,y:17293,width:12,depth:56},
  {id:'ruins',name:'古道遗迹',kind:'ruins',x:6500,y:24600},
].map((p,i)=>{const key=['village','goldmine','quarry','pass','forest','deepforest','meadow','plain','wetland','eastbridge',null,'ruins'][i];const q=key?point(REFERENCE_LANDMARKS[key]):[VILLAGE.x+110,VILLAGE.y-115];if(p.kind==='bridge'){const bridge=[...REFERENCE_CROSSINGS].sort((a,b)=>Math.hypot(a.x-q[0],a.y-q[1])-Math.hypot(b.x-q[0],b.y-q[1]))[0];namedBridgeIds.add(bridge.id);return Object.freeze({...bridge,id:p.id,name:p.name});}return Object.freeze({...p,x:q[0],y:q[1]});}).concat(REFERENCE_CROSSINGS.filter(p=>!namedBridgeIds.has(p.id)).map(Object.freeze),[Object.freeze({id:'village-spring',kind:'spring',name:'山泉源头',x:VILLAGE_SPRING.x,y:VILLAGE_SPRING.y})]));
const {x:VX,y:VY}=VILLAGE;
// 削去矩形四角的寨墙，视觉和碰撞共用折线；南门缺口保持12米。
const WALLS=[[-6,80,-70,80],[-70,80,-90,56],[-90,56,-90,-55],[-90,-55,-70,-80],[-70,-80,70,-80],[70,-80,90,-55],[90,-55,90,56],[90,56,70,80],[70,80,6,80]];
const house=(id,x,y)=>({id,kind:'house',name:'村民屋',x:VX+x,y:VY+y,width:26,depth:14,visualWidth:34,beds:2,door:{x:VX+x,y:VY+y+10}});
const STRUCTURES=Object.freeze([
  {id:'lord-hall',kind:'hall',name:'寨主住所／议事厅',x:VX,y:VY-48,width:50,depth:24,visualWidth:60,beds:1,door:{x:VX,y:VY-32}},
  house('house-west-1',-51,-24),house('house-west-2',-55,10),
  house('house-east-1',49,-27),house('house-east-2',55,6),house('house-east-3',50,36),
  {id:'workshop',kind:'workshop',name:'工坊',x:VX+50,y:VY+59,width:26,depth:16,visualWidth:36,door:{x:VX+50,y:VY+70}},
  {id:'storehouse',kind:'storehouse',name:'储物间',x:VX-51,y:VY+46,width:26,depth:16,visualWidth:36,door:{x:VX-51,y:VY+57}},
].map(Object.freeze));
export function buildings(){return structuredClone(STRUCTURES);}
const RIVERS=[...REFERENCE_RIVERS,VILLAGE_CREEK];
export const ROADS=[...REFERENCE_ROADS,...LOCAL_ROADS];
const starter=(id,kind,resource,dx,dy,amount)=>Object.freeze({id:'starter:'+id,kind,resource,x:VX+dx,y:VY+dy,amount,radius:kind==='oak'?1.1:1.5});
const FIXED=Object.freeze([
  starter('wood-east','oak','wood',145,142,24),starter('wood-west','pine','wood',-140,138,24),
  starter('stone','rock','stone',-170,125,30),starter('fiber','fiber','fiber',100,205,30),
  starter('berries','berry','food',-130,155,24),
  ...[[-35,28],[-18,40],[15,38],[35,20],[42,-15],[-38,-20]].map(([x,y],i)=>Object.freeze({id:`quarry:stone:${i}`,kind:'rock',resource:'stone',x:LANDMARKS[2].x+x,y:LANDMARKS[2].y+y,amount:120,radius:1.7})),
  Object.freeze({id:'mine:northwest:ore',kind:'goldore',resource:'gold',x:LANDMARKS[1].x+18,y:LANDMARKS[1].y+22,amount:500,radius:1.5}),
]);
const cache=new Map();
const finite=(...n)=>{if(!n.every(Number.isFinite))throw new RangeError('坐标必须是有限数值');};
const hash=(x,y,s=0)=>{let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(s+REGION.seed,1274126177);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
function noise(x,y,scale,s){
  const gx=Math.floor(x/scale),gy=Math.floor(y/scale),fx=x/scale-gx,fy=y/scale-gy;
  const a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy),top=hash(gx,gy,s)*(1-a)+hash(gx+1,gy,s)*a;
  return top*(1-b)+(hash(gx,gy+1,s)*(1-a)+hash(gx+1,gy+1,s)*a)*b;
}
const riverIndex=lineIndex(RIVERS.map(r=>({...r,points:smoothLine(r.points)})));
const waterVisualIndex=lineIndex(RIVERS.map(r=>({...r,points:smoothLine(r.points)})),512,2400);
const waterClearance=(x,y)=>Math.min(waterVisualIndex(x,y),Math.hypot(x-VILLAGE_SPRING.x,y-VILLAGE_SPRING.y)-VILLAGE_SPRING.radius);
const roadIndex=lineIndex(ROADS.map(points=>({points,width:3.5})),512,80);
// Keep sprite overhangs out of the road corridor, not merely their anchor points.
const roadClearance=lineIndex(ROADS.map(points=>({points,width:8})),512,2400);
const LOCAL_PATHS=STRUCTURES.map(b=>smoothLine([[VX,b.door.y+10],[VX+(b.door.x-VX)*.48,b.door.y+5],[b.door.x,b.door.y]]));
function onRoad(x,y){
  if(roadIndex(x,y)<0)return true;
  if(Math.abs(x-VX)>100||Math.abs(y-VY)>100)return false;
  if(LOCAL_PATHS.some(points=>points.some((p,i)=>i>0&&segmentDistance(x,y,points[i-1],p)<2.2)))return true;
  // 火塘、水井共同组成公共活动场地，边缘自然起伏。
  return ((x-VX)/25)**2+((y-VY-14)/24)**2<1+Math.sin(x*.7)*.055;
}
function inBridge(x,y){return LANDMARKS.some(p=>{if(p.kind!=='bridge')return false;const a=p.angle||0,dx=x-p.x,dy=y-p.y;return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<p.width/2&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<p.depth/2;});}
export function terrainAt(x,y){
  finite(x,y);
  if(inBridge(x,y))return{kind:'bridge',index:7,walkable:true};
  if(inLake(x,y)||Math.hypot(x-VILLAGE_SPRING.x,y-VILLAGE_SPRING.y)<VILLAGE_SPRING.radius)return{kind:'water',index:5,walkable:false};
  const bank=riverIndex(x,y);
  if(bank<0)return{kind:'water',index:5,walkable:false};
  if(bank<10)return{kind:'sand',index:6,walkable:true};
  if(onRoad(x,y)&&!inMountain(x,y))return{kind:'path',index:7,walkable:true};
  if(Math.hypot(x-LANDMARKS[2].x,y-LANDMARKS[2].y)<100)return{kind:'hill',index:3,walkable:true};
  if(((x-VX)/245)**2+((y-VY)/260)**2<1||Math.hypot(x-LANDMARKS[1].x,y-LANDMARKS[1].y)<100)return{kind:'grass',index:0,walkable:true};
  const n=noise(x,y,2400,1)*.7+noise(x,y,500,2)*.3;
  if(inMountain(x,y))return n>.62&&y<6500?{kind:'snow',index:9,walkable:false}:{kind:'mountain',index:4,walkable:false};
  if(inWetland(x,y)){
    const marsh=noise(x,y,100,32)*.7+noise(x,y,45,33)*.3;
    if(marsh>.56)return{kind:'water',index:5,walkable:false};
    if(marsh>.52)return{kind:'sand',index:6,walkable:true};
    return{kind:'wetland',index:8,walkable:true};
  }
  if(inForest(x,y))return n>.48?{kind:'deepforest',index:2,walkable:true}:{kind:'forest',index:1,walkable:true};
  return{kind:'grass',index:0,walkable:true};
}
export function chunkAt(x,y){finite(x,y);return{x:Math.floor(x/128),y:Math.floor(y/128)};}
function validChunk(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=250||y>=250)throw new RangeError('分块超出首批32公里区域');}
function owns(p,cx,cy){return Math.floor(p.x/128)===cx&&Math.floor(p.y/128)===cy;}
function villageProps(){
  const props=STRUCTURES.map(b=>({...b,amount:0,radius:0}));
  props.push({id:'well',kind:'well',x:VX+15,y:VY+27,width:10,depth:5,radius:2.5},
    {id:'hearth',kind:'fire',x:VX-10,y:VY+6,width:10,depth:5,radius:3},
    {id:'lookout',kind:'tower',x:VX+26,y:VY+74,width:10,depth:7},
    {id:'gate',kind:'gate',x:VX,y:VY+80,width:32,depth:2});
  for(let edge=0;edge<WALLS.length;edge++){
    const [ax,ay,bx,by]=WALLS[edge],count=Math.ceil(Math.hypot(bx-ax,by-ay)/3);
    for(let i=0;i<=count;i++){
      const side=Math.abs(by-ay)>Math.abs(bx-ax);
      props.push({id:`wall:${edge}:${i}`,kind:'fence',x:VX+ax+(bx-ax)*i/count,y:VY+ay+(by-ay)*i/count,width:side?2:3.4,depth:side?3:1});
    }
  }
  const detail=(kind,x,y,width=3,depth=2)=>props.push({id:`village-detail:${props.length}`,kind,x:VX+x,y:VY+y,width,depth,radius:kind==='ornamental-tree'?.7:0});
  for(const [x,y]of [[-73,-49],[-70,-12],[-76,24],[-72,59],[72,-49],[76,-9],[76,25],[74,59],[-39,-66],[39,-66]]){
    detail('garden',x,y,13,6);detail('bush',x-4,y,5,2);detail('flowers',x+3,y+2,4,2);
  }
  for(const [x,y]of [[-30,-51],[30,-51],[-38,61],[34,66],[-74,-39],[73,-36],[-75,-3],[76,17],[-75,39],[72,47],[-52,-66],[53,-66]])detail('ornamental-tree',x,y,10,4);
  for(const [x,y]of [[-24,12],[-23,24],[9,23]])detail('bench',x,y,6,2);
  for(const [x,y]of [[-66,53],[-65,58],[66,62]])detail('woodpile',x,y,6,3);
  for(const [x,y]of [[-38,51],[-38,56],[38,63]])detail('crate',x,y,3,3);
  for(const b of STRUCTURES){detail('flowers',b.x-VX+b.width*.48,b.y-VY+5,3,2);detail('lantern',b.door.x-VX-3,b.door.y-VY,2,3);}
  for(const x of [-7,7])detail('banner',x,73,3,5);
  // 每组包含高低不同的树、灌木、花与石，形成林缘和庭院层次。
  for(const [x,y]of [[-77,-58],[76,-60],[-77,55],[75,55],[-35,-68],[36,-69],[-32,41],[33,43]]){
    detail('bush',x,y,5,2);detail('bush',x+4,y+3,4,2);detail('flowers',x-3,y+4,4,2);detail('ornamental-rock',x+5,y+6,4,2);
  }
  return props;
}
const VILLAGE_PROPS=villageProps();
const BRIDGE_PROPS=LANDMARKS.filter(p=>p.kind==='bridge').flatMap(b=>{
  const horizontal=b.width>b.depth,length=horizontal?b.width:b.depth,result=[];
  for(let offset=0;offset<length;offset+=8){
    const part=Math.min(8,length-offset),along=-length/2+offset+part/2;
    result.push({id:`${b.id}:plank:${offset}`,kind:horizontal?'bridge-horizontal':'bridge-vertical',
      x:b.x+(horizontal?along*Math.cos(b.angle||0):0),y:b.y+(horizontal?along*Math.sin(b.angle||0):along),angle:b.angle||0,width:horizontal?part:b.width,depth:horizontal?b.depth:part});
  }
  return result;
});
function propsFor(cx,cy){
  const props=VILLAGE_PROPS.filter(p=>owns(p,cx,cy)).map(p=>({...p}));
  props.push(...FIXED.filter(p=>owns(p,cx,cy)),...BRIDGE_PROPS.filter(p=>owns(p,cx,cy)));
  for(const p of LANDMARKS.filter(p=>['goldmine','ruins'].includes(p.kind)&&owns(p,cx,cy)))props.push({...p,width:24,depth:16});
  for(let gy=Math.floor(cy*128/96)-1;gy<=Math.floor((cy*128+127)/96);gy++)for(let gx=Math.floor(cx*128/96)-1;gx<=Math.floor((cx*128+127)/96);gx++){
    const x=gx*96+20+hash(gx,gy,35)*56,y=gy*96+20+hash(gx,gy,36)*56,t=terrainAt(x,y),width=100+hash(gx,gy,37)*45;
    if(!owns({x,y},cx,cy)||Math.hypot(x-LANDMARKS[1].x,y-LANDMARKS[1].y)<100+width*.55)continue;
    if(['mountain','snow'].includes(t.kind)&&roadClearance(x,y)>width*.7&&waterClearance(x,y)>width*.7)props.push({id:`ridge:${gx}:${gy}`,kind:t.kind==='snow'?'snow-peak':hash(gx,gy,38)<.45?'mountain-ridge':'mountain-peak',x,y,width,depth:28,radius:0});
  }
  for(let i=0;i<16;i++){
    const x=cx*128+(i%4)*32+16,y=cy*128+Math.floor(i/4)*32+16;
    if(terrainAt(x,y).kind==='wetland')props.push({id:`reeds:${cx}:${cy}:${i}`,kind:'reeds',x,y,width:8,depth:3,radius:0});
  }
  // 16米放置网格＋固定整数散列；读取相邻块不会消耗共享随机状态。
  for(let i=0;i<64;i++){
    const gx=cx*8+i%8,gy=cy*8+Math.floor(i/8),x=gx*16+4+hash(gx,gy,4)*8,y=gy*16+4+hash(gx,gy,5)*8;
    if(Math.abs(x-VX)<112&&Math.abs(y-VY)<110||FIXED.some(p=>Math.hypot(x-p.x,y-p.y)<10)||Math.hypot(x-LANDMARKS[1].x,y-LANDMARKS[1].y)<110)continue;
    const t=terrainAt(x,y),r=hash(gx,gy,6);if(!t.walkable||['path','bridge','sand'].includes(t.kind))continue;
    let kind,resource,amount,radius;
    const density=t.kind==='deepforest'?.80:t.kind==='forest'?.53:t.kind==='grass'?.12:.20;
    if(r<density){kind=hash(gx,gy,7)<.45?'pine':'oak';resource='wood';amount=16+Math.floor(hash(gx,gy,8)*16);radius=1.1;}
    else if(r>.94){kind='rock';resource='stone';amount=20;radius=1.7;}
    else if(r>.87){kind='fiber';resource='fiber';amount=8;radius=0;}
    else if(r>.82&&t.kind!=='hill'){kind='berry';resource='food';amount=6;radius=.8;}
    if(kind)props.push({id:`p1:${cx}:${cy}:${i}`,kind,resource,amount,radius,x,y});
  }
  // 视觉环境层使用固定ID，不制造可采集库存；树干仍有同源碰撞。
  for(let i=0;i<256;i++){
    const gx=cx*16+i%16,gy=cy*16+Math.floor(i/16),x=gx*8+hash(gx,gy,21)*5,y=gy*8+hash(gx,gy,22)*5;
    if(Math.abs(x-VX)<100&&Math.abs(y-VY)<95||LANDMARKS.some(p=>['goldmine','ruins'].includes(p.kind)&&Math.hypot(p.x-x,p.y-y)<45))continue;
    const t=terrainAt(x,y);if(!t.walkable||['path','bridge','sand'].includes(t.kind))continue;
    if(FIXED.some(p=>Math.hypot(p.x-x,p.y-y)<7)||props.some(p=>p.radius>0&&Math.hypot(p.x-x,p.y-y)<4))continue;
    const r=hash(gx,gy,23),near=Math.hypot(x-VX,y-VY)<230;
    const treeChance=t.kind==='deepforest'?.64:t.kind==='forest'?.45:near?.25:.05;
    if(r<treeChance){
      const pineChance=t.kind==='hill'?.65:near?.12:.24;
      const kind=hash(gx,gy,26)<pineChance?'scenery-pine':hash(gx,gy,27)<.35?'scenery-tree-gold':'scenery-tree';
      props.push({id:`environment:${cx}:${cy}:${i}`,kind,x,y,width:9+hash(gx,gy,24)*3,depth:3,radius:.8});
    }
    else if(r<treeChance+.17)props.push({id:`environment:${cx}:${cy}:${i}`,kind:r<treeChance+.07?'flowers':'bush',x,y,width:3+hash(gx,gy,25)*2,depth:2,radius:0});
  }
  return props.map(p=>Object.freeze(p));
}
export function getChunk(cx,cy){
  validChunk(cx,cy);const key=`${cx}:${cy}`;
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  const tiles=[];for(let y=0;y<64;y++)for(let x=0;x<64;x++)tiles.push(terrainAt(cx*128+x*2+1,cy*128+y*2+1).index);
  const halo=[];for(let y=-1;y<=64;y++)for(let x=-1;x<=64;x++)halo.push(terrainAt(cx*128+x*2+1,cy*128+y*2+1).index);
  const value=Object.freeze({id:key,cx,cy,x:cx*128,y:cy*128,size:128,cells:64,tiles:Object.freeze(tiles),halo:Object.freeze(halo),props:Object.freeze(propsFor(cx,cy))});
  cache.set(key,value);if(cache.size>REGION.cacheLimit)cache.delete(cache.keys().next().value);return value;
}
export const cacheStats=()=>({size:cache.size,limit:REGION.cacheLimit});
export function resourceById(id){
  if(typeof id!=='string')return null;
  const fixed=FIXED.find(p=>p.id===id);if(fixed)return{...fixed};
  const m=/^p1:(\d{1,3}):(\d{1,3}):(\d{1,2})$/.exec(id);if(!m||+m[1]>=250||+m[2]>=250||+m[3]>=64)return null;
  const p=getChunk(+m[1],+m[2]).props.find(p=>p.id===id&&p.resource);return p?{...p}:null;
}
export function nearbyResources(x,y,radius=5){
  finite(x,y,radius);if(radius<0||radius>512)throw new RangeError('查询半径必须在0—512米内');
  const a=chunkAt(x-radius,y-radius),b=chunkAt(x+radius,y+radius),result=[];
  for(let cy=Math.max(0,a.y);cy<=Math.min(249,b.y);cy++)for(let cx=Math.max(0,a.x);cx<=Math.min(249,b.x);cx++)
    for(const p of getChunk(cx,cy).props)if(p.resource&&Math.hypot(p.x-x,p.y-y)<=radius)result.push({...p});
  return result.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)||a.id.localeCompare(b.id));
}
function inBox(x,y,p,r){return Math.abs(x-p.x)<p.width/2+r&&Math.abs(y-p.y)<p.depth/2+r;}
const collisionCache=new Map();
function collisionProps(cx,cy){const key=`${cx}:${cy}`;if(collisionCache.has(key))return collisionCache.get(key);const props=getChunk(cx,cy).props.filter(p=>p.radius>0||p.kind==='goldmine'||p.kind==='ruins');if(collisionCache.size>=96)collisionCache.delete(collisionCache.keys().next().value);collisionCache.set(key,props);return props;}
export function isBlocked(x,y,{gateOpen=true,depleted=new Set()}={}){
  finite(x,y);const radius=.4;
  if(x<radius||y<radius||x>=32000-radius||y>=32000-radius)return true;
  for(const [dx,dy] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(!terrainAt(x+dx,y+dy).walkable)return true;
  const dx=x-VX,dy=y-VY;
  if(WALLS.some(([ax,ay,bx,by])=>segmentDistance(dx,dy,[ax,ay],[bx,by])<.9))return true;
  if(Math.abs(dx)<6.4&&Math.abs(dy-80)<.9&&!gateOpen)return true;
  if(STRUCTURES.some(p=>inBox(x,y,p,radius)))return true;
  if(inBox(x,y,{x:VX+26,y:VY+74,width:7,depth:7},radius))return true;
  if(Math.hypot(x-VX-15,y-VY-27)<2.5+radius||Math.hypot(x-VX+10,y-VY-6)<3+radius)return true;
  const c=chunkAt(x,y);
  for(let cy=Math.max(0,c.y-1);cy<=Math.min(249,c.y+1);cy++)for(let cx=Math.max(0,c.x-1);cx<=Math.min(249,c.x+1);cx++){
    for(const p of collisionProps(cx,cy)){
      if(p.radius>0&&(!p.resource||!depleted.has(p.id))&&Math.hypot(x-p.x,y-p.y)<p.radius+radius)return true;
      if((p.kind==='goldmine'||p.kind==='ruins')&&inBox(x,y,p,radius))return true;
    }
  }
  return false;
}
/** 扫掠长度≤0.25米，不能通过一次大输入越墙；斜向不加速。 */
export function sweepMove(position,input,distance,state={}){
  finite(position.x,position.y,input.x,input.y,distance);if(distance<0||distance>128)throw new RangeError('单步距离越界');
  const length=Math.hypot(input.x,input.y);if(!length||!distance)return{...position};
  const count=Math.ceil(distance/.25),dx=input.x/Math.max(1,length)*distance/count,dy=input.y/Math.max(1,length)*distance/count;
  let{x,y}=position;for(let i=0;i<count;i++){
    if(!isBlocked(x+dx,y+dy,state)){x+=dx;y+=dy;}
    else if(!isBlocked(x+dx,y,state))x+=dx;
    else if(!isBlocked(x,y+dy,state))y+=dy;
  }
  return{x,y};
}
const atlasCache=new Map();
const viewportCache=new Map();
/** Cartographic aggregates retain world anchors; detailed chunks continue to render above them. */
export function overviewProps(x,y,span,size=512){
 const inside=p=>p.x>=x-400&&p.y>=y-400&&p.x<=x+span+400&&p.y<=y+span+400;
 if(span<=1024){const result=[];for(let cy=Math.max(0,Math.floor(y/128));cy<=Math.min(249,Math.floor((y+span)/128));cy++)for(let cx=Math.max(0,Math.floor(x/128));cx<=Math.min(249,Math.floor((x+span)/128));cx++)result.push(...getChunk(cx,cy).props);return result;}
 const result=[],step=2**Math.ceil(Math.log2(Math.max(16,span/150))),m=span/2048;
 for(let gy=Math.floor(y/step);gy<=Math.ceil((y+span)/step);gy++)for(let gx=Math.floor(x/step);gx<=Math.ceil((x+span)/step);gx++){
  const px=(gx+.2+hash(gx,gy,50)*.6)*step,py=(gy+.2+hash(gx,gy,51)*.6)*step,t=terrainAt(px,py);
  if(Math.abs(px-VX)<130&&Math.abs(py-VY)<130)continue;
  let kind,width;
  if(t.kind==='mountain'||t.kind==='snow')continue;
  else if(t.kind==='forest'||t.kind==='deepforest'||t.kind==='grass'&&hash(gx,gy,53)<.18){kind=hash(gx,gy,54)<.55?'pine':'oak';width=step*1.3;}
  else if(t.kind==='wetland'){kind='reeds';width=step*.6;}
  if(kind&&roadClearance(px,py)>width*.65)result.push({id:`aggregate:${step}:${gx}:${gy}`,kind,x:px,y:py,width,depth:0});
 }
 // A village miniature preserves its internal arrangement when physical buildings become subpixel.
 const mountainStep=Math.max(96,2**Math.ceil(Math.log2(span/35)));
 for(let gy=Math.floor(y/mountainStep);gy<=Math.ceil((y+span)/mountainStep);gy++)for(let gx=Math.floor(x/mountainStep);gx<=Math.ceil((x+span)/mountainStep);gx++){
  const px=(gx+.3+hash(gx,gy,61)*.4)*mountainStep,py=(gy+.3+hash(gx,gy,62)*.4)*mountainStep,t=terrainAt(px,py);
  const width=Math.min(mountainStep*2.1,roadClearance(px,py)/.7,waterClearance(px,py)/.7);
  if((t.kind==='mountain'||t.kind==='snow')&&width>=mountainStep*.35)result.push({id:`massif:${mountainStep}:${gx}:${gy}`,kind:t.kind==='snow'?'snow-peak':hash(gx,gy,63)<.25?'mountain-ridge':'mountain-peak',x:px,y:py,width,depth:0});
 }
 const scale=Math.max(1,m*32/180);
 result.push(...VILLAGE_PROPS.map(p=>({...p,mapLayer:1,x:VX+(p.x-VX)*scale,y:VY+(p.y-VY)*scale,width:(p.visualWidth||p.width)*scale,visualWidth:0,depth:p.depth*scale})).filter(inside));
 result.push(...LANDMARKS.filter(p=>['goldmine','ruins','bridge'].includes(p.kind)).map(p=>({...p,kind:p.kind==='bridge'?(p.width>p.depth?'bridge-horizontal':'bridge-vertical'):p.kind,width:Math.max(p.width||24,m*7),depth:Math.max(p.depth||16,m*2)})).filter(inside));
 return result.sort((a,b)=>a.y-b.y);
}
function overviewTile(x,y,m){const t=terrainAt(x,y);if(t.index===5||t.index===7||t.index===4||t.index===9)return t.index;return roadIndex(x,y)<Math.min(70,m*.7)?7:t.index;}
/** Display-only LOD raster sampled from the same authoritative terrain generator. */
export function viewportRaster(centerX,centerY,span,size=256){
 if(![centerX,centerY,span,size].every(Number.isFinite)||centerX<0||centerX>32000||centerY<0||centerY>32000||!Number.isInteger(span)||span<512||span>32000||![256,512,1024,2048].includes(size))throw new RangeError('远景地图范围无效');
 const x=Math.max(0,Math.min(32000-span,Math.round(centerX-span/2))),y=Math.max(0,Math.min(32000-span,Math.round(centerY-span/2))),key=[x,y,span,size].join(':');
 if(viewportCache.has(key))return viewportCache.get(key);const pixels=[],metresPerPixel=span/size;
 for(let row=0;row<size;row++)for(let col=0;col<size;col++)pixels.push(overviewTile(x+(col+.5)*metresPerPixel,y+(row+.5)*metresPerPixel,metresPerPixel));
 const value=Object.freeze({size,x,y,span,metresPerPixel,pixels:Object.freeze(pixels),props:overviewProps(x,y,span,size)});viewportCache.set(key,value);while(viewportCache.size>16)viewportCache.delete(viewportCache.keys().next().value);return value;
}
export function atlas(size=256){
  if(![128,256,512,1024,2048].includes(size))throw new RangeError('总览尺寸只允许128/256/512');
  if(atlasCache.has(size))return atlasCache.get(size);
  const pixels=[],m=32000/size;for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels.push(overviewTile((x+.5)*m,(y+.5)*m,m));
  const result=Object.freeze({size,x:0,y:0,span:32000,metresPerPixel:m,pixels:Object.freeze(pixels),props:overviewProps(0,0,32000,size)});atlasCache.set(size,result);return result;
}

const miniCache=new Map();
/** 鹰眼中心按128米对齐，有限缓存；地图、位置均来自真实世界坐标。 */
export function minimap(x,y){
  finite(x,y);if(x<0||y<0||x>=32000||y>=32000)throw new RangeError('鹰眼坐标越界');
  const c=chunkAt(x,y),key=`${c.x}:${c.y}`;if(miniCache.has(key))return miniCache.get(key);
  const centerX=c.x*128+64,centerY=c.y*128+64,pixels=[];
  for(let row=0;row<128;row++)for(let col=0;col<128;col++){
    const px=centerX-512+(col+.5)*8,py=centerY-512+(row+.5)*8;
    pixels.push(px<0||py<0||px>=32000||py>=32000?-1:terrainAt(px,py).index);
  }
  const result=Object.freeze({x:centerX,y:centerY,span:1024,size:128,pixels:Object.freeze(pixels)});
  miniCache.set(key,result);if(miniCache.size>8)miniCache.delete(miniCache.keys().next().value);return result;
}
