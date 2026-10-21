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
  x:13824,y:17408,width:180,height:160,
  gate:Object.freeze({x:13824,y:17488,width:12}),
  spawn:Object.freeze({x:13824,y:17438}),
});
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
  {id:'creek-bridge',name:'村北木桥',kind:'bridge',x:14500,y:17130,width:12,depth:95},
  {id:'ruins',name:'古道遗迹',kind:'ruins',x:6500,y:24600},
].map(Object.freeze));
const {x:VX,y:VY}=VILLAGE;
const house=(id,x,y)=>({id,kind:'house',name:'村民屋',x:VX+x,y:VY+y,width:14,depth:10,beds:2,door:{x:VX+x,y:VY+y+8}});
const STRUCTURES=Object.freeze([
  {id:'lord-hall',kind:'hall',name:'寨主住所／议事厅',x:VX,y:VY-48,width:28,depth:18,beds:1,door:{x:VX,y:VY-35}},
  house('house-west-1',-55,-42),house('house-west-2',-55,-6),
  house('house-east-1',53,-40),house('house-east-2',53,-5),house('house-east-3',53,28),
  {id:'workshop',kind:'workshop',name:'工坊',x:VX+50,y:VY+59,width:22,depth:14,door:{x:VX+50,y:VY+70}},
  {id:'storehouse',kind:'storehouse',name:'储物间',x:VX-51,y:VY+46,width:22,depth:16,door:{x:VX-51,y:VY+57}},
].map(Object.freeze));
export function buildings(){return structuredClone(STRUCTURES);}
const RIVERS=[
  {width:86,points:[[22900,-1024],[22500,4000],[20100,8000],[21400,12000],[18700,15500],[19400,20000],[19400,21000],[23500,25000],[21500,28500],[22000,33024]]},
  {width:24,points:[[7000,6000],[10500,10000],[13350,16680],[14500,17130],[16600,16900],[18700,15500]]},
];
const ROADS=[
  [[VX,VY-36],[VX,VY+250],[12500,19500],[9800,16700],[7700,13200],[7000,8000],[3600,3600]],
  [[VX,VY+250],[16000,19600],[19150,20000],[19250,20000],[19400,20000],[19550,20000],[19650,20000],[23000,20500],[28000,23000],[33024,23500]],
  [[VX,VY+250],[13700,21500],[12000,25200],[15000,33024]],
  [[VX,VY+250],[VX+135,VY+140],[VX+145,VY-120],[14500,17240],[14500,17190],[14500,17130],[14500,17070],[14500,17020],[16000,14000],[15500,9200],[14400,5000],[14400,-1024]],
  [[9800,16700],[6000,18000],[2000,18500],[-1024,18000]],
];
const starter=(id,kind,resource,dx,dy,amount)=>Object.freeze({id:'starter:'+id,kind,resource,x:VX+dx,y:VY+dy,amount,radius:kind==='oak'?1.1:1.5});
const FIXED=Object.freeze([
  starter('wood-east','oak','wood',145,142,24),starter('wood-west','pine','wood',-140,138,24),
  starter('stone','rock','stone',-170,125,30),starter('fiber','fiber','fiber',100,205,30),
  starter('berries','berry','food',-130,155,24),
  ...[[-35,28],[-18,40],[15,38],[35,20],[42,-15],[-38,-20]].map(([x,y],i)=>Object.freeze({id:`quarry:stone:${i}`,kind:'rock',resource:'stone',x:7700+x,y:13200+y,amount:120,radius:1.7})),
  Object.freeze({id:'mine:northwest:ore',kind:'goldore',resource:'gold',x:3618,y:3622,amount:500,radius:1.5}),
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
const roadIndex=lineIndex(ROADS.map(points=>({points,width:3.5})),512,1);
function onRoad(x,y){return roadIndex(x,y)<0||STRUCTURES.some(b=>segmentDistance(x,y,[VX,b.door.y],[b.door.x,b.door.y])<2.3);}
function inBridge(x,y){return LANDMARKS.some(p=>p.kind==='bridge'&&Math.abs(x-p.x)<p.width/2&&Math.abs(y-p.y)<p.depth/2);}
export function terrainAt(x,y){
  finite(x,y);
  if(inBridge(x,y))return{kind:'bridge',index:7,walkable:true};
  const bank=riverIndex(x,y);
  if(bank<0)return{kind:'water',index:5,walkable:false};
  if(bank<10)return{kind:'sand',index:6,walkable:true};
  if(onRoad(x,y))return{kind:'path',index:7,walkable:true};
  if(((x-VX)/245)**2+((y-VY)/260)**2<1||Math.hypot(x-3600,y-3600)<100)return{kind:'grass',index:0,walkable:true};
  const n=noise(x,y,2400,1)*.7+noise(x,y,500,2)*.3;
  const ridge=Math.exp(-(((x-4900)/5900)**2+((y-6100)/9400)**2));
  const east=Math.exp(-(((x-30800)/4200)**2+((y-2000)/6000)**2));
  const north=Math.exp(-(((x-11000)/2200)**2+((y-4200)/1900)**2))*.65+Math.exp(-(((x-16700)/1800)**2+((y-4200)/1900)**2))*.65;
  const height=ridge*.8+east*.55+north+n*.42;
  if(height>.97)return{kind:'snow',index:9,walkable:false};
  if(height>.75)return{kind:'mountain',index:4,walkable:false};
  if(height>.58)return{kind:'hill',index:3,walkable:true};
  if(x>23500&&y>23000&&n<.62)return{kind:'wetland',index:8,walkable:true};
  const plain=Math.exp(-(((x-12500)/8000)**2+((y-26800)/5500)**2));
  const forest=n+(y<13000?.2:0)+(x>23000?.18:0)-plain*.38;
  if(forest>.72)return{kind:'deepforest',index:2,walkable:true};
  if(forest>.48)return{kind:'forest',index:1,walkable:true};
  return{kind:'grass',index:0,walkable:true};
}
export function chunkAt(x,y){finite(x,y);return{x:Math.floor(x/128),y:Math.floor(y/128)};}
function validChunk(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=250||y>=250)throw new RangeError('分块超出首批32公里区域');}
function owns(p,cx,cy){return Math.floor(p.x/128)===cx&&Math.floor(p.y/128)===cy;}
function villageProps(){
  const props=STRUCTURES.map(b=>({...b,amount:0,radius:0}));
  props.push({id:'well',kind:'well',x:VX+25,y:VY+18,width:4,depth:4,radius:2},
    {id:'hearth',kind:'fire',x:VX-13,y:VY+6,width:5,depth:5,radius:2.5},
    {id:'lookout',kind:'tower',x:VX+21,y:VY+74,width:7,depth:7},
    {id:'gate',kind:'gate',x:VX,y:VY+80,width:16.8,depth:2});
  for(let x=-90;x<=90;x+=3){
    props.push({id:`wall:n:${x}`,kind:'fence',x:VX+x,y:VY-80,width:3,depth:1});
    if(Math.abs(x)>6)props.push({id:`wall:s:${x}`,kind:'fence',x:VX+x,y:VY+80,width:3,depth:1});
  }
  for(let y=-77;y<80;y+=3)for(const side of [-1,1])props.push({id:`wall:${side}:${y}`,kind:'fence',x:VX+side*90,y:VY+y,width:1,depth:3});
  return props;
}
const VILLAGE_PROPS=villageProps();
const BRIDGE_PROPS=LANDMARKS.filter(p=>p.kind==='bridge').flatMap(b=>{
  const horizontal=b.width>b.depth,length=horizontal?b.width:b.depth,result=[];
  for(let offset=0;offset<length;offset+=8){
    const part=Math.min(8,length-offset),along=-length/2+offset+part/2;
    result.push({id:`${b.id}:plank:${offset}`,kind:horizontal?'bridge-horizontal':'bridge-vertical',
      x:b.x+(horizontal?along:0),y:b.y+(horizontal?0:along),width:horizontal?part:b.width,depth:horizontal?b.depth:part});
  }
  return result;
});
function propsFor(cx,cy){
  const props=VILLAGE_PROPS.filter(p=>owns(p,cx,cy)).map(p=>({...p}));
  props.push(...FIXED.filter(p=>owns(p,cx,cy)),...BRIDGE_PROPS.filter(p=>owns(p,cx,cy)));
  for(const p of LANDMARKS.filter(p=>['goldmine','ruins'].includes(p.kind)&&owns(p,cx,cy)))props.push({...p,width:24,depth:16});
  // 16米放置网格＋固定整数散列；读取相邻块不会消耗共享随机状态。
  for(let i=0;i<64;i++){
    const gx=cx*8+i%8,gy=cy*8+Math.floor(i/8),x=gx*16+4+hash(gx,gy,4)*8,y=gy*16+4+hash(gx,gy,5)*8;
    if(Math.abs(x-VX)<112&&Math.abs(y-VY)<110||FIXED.some(p=>Math.hypot(x-p.x,y-p.y)<10)||Math.hypot(x-3600,y-3600)<110)continue;
    const t=terrainAt(x,y),r=hash(gx,gy,6);if(!t.walkable||['path','bridge','sand'].includes(t.kind))continue;
    let kind,resource,amount,radius;
    const density=t.kind==='deepforest'?.80:t.kind==='forest'?.53:t.kind==='grass'?.12:.20;
    if(r<density){kind=hash(gx,gy,7)<.45?'pine':'oak';resource='wood';amount=16+Math.floor(hash(gx,gy,8)*16);radius=1.1;}
    else if(r>.94){kind='rock';resource='stone';amount=20;radius=1.7;}
    else if(r>.87){kind='fiber';resource='fiber';amount=8;radius=0;}
    else if(r>.82&&t.kind!=='hill'){kind='berry';resource='food';amount=6;radius=.8;}
    if(kind)props.push({id:`p1:${cx}:${cy}:${i}`,kind,resource,amount,radius,x,y});
  }
  return props.map(p=>Object.freeze(p));
}
export function getChunk(cx,cy){
  validChunk(cx,cy);const key=`${cx}:${cy}`;
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  const tiles=[];for(let y=0;y<64;y++)for(let x=0;x<64;x++)tiles.push(terrainAt(cx*128+x*2+1,cy*128+y*2+1).index);
  const value=Object.freeze({id:key,cx,cy,x:cx*128,y:cy*128,size:128,cells:64,tiles:Object.freeze(tiles),props:Object.freeze(propsFor(cx,cy))});
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
export function isBlocked(x,y,{gateOpen=true,depleted=new Set()}={}){
  finite(x,y);const radius=.4;
  if(x<radius||y<radius||x>=32000-radius||y>=32000-radius)return true;
  for(const [dx,dy] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(!terrainAt(x+dx,y+dy).walkable)return true;
  const dx=x-VX,dy=y-VY;
  if(Math.abs(dx)<=90.8&&Math.abs(dy+80)<.9||Math.abs(dy)<=80.8&&Math.abs(Math.abs(dx)-90)<.9)return true;
  if(Math.abs(dx)<=90.8&&Math.abs(dy-80)<.9&&(!gateOpen||Math.abs(dx)>6-radius))return true;
  if(STRUCTURES.some(p=>inBox(x,y,p,radius)))return true;
  if(inBox(x,y,{x:VX+21,y:VY+74,width:7,depth:7},radius))return true;
  if(Math.hypot(x-VX-25,y-VY-18)<2+radius||Math.hypot(x-VX+13,y-VY-6)<2.5+radius)return true;
  const c=chunkAt(x,y);
  for(let cy=Math.max(0,c.y-1);cy<=Math.min(249,c.y+1);cy++)for(let cx=Math.max(0,c.x-1);cx<=Math.min(249,c.x+1);cx++){
    for(const p of getChunk(cx,cy).props){
      if(p.resource&&!depleted.has(p.id)&&p.radius>0&&Math.hypot(x-p.x,y-p.y)<p.radius+radius)return true;
      if(['goldmine','ruins'].includes(p.kind)&&inBox(x,y,p,radius))return true;
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
export function atlas(size=256){
  if(![128,256,512].includes(size))throw new RangeError('总览尺寸只允许128/256/512');
  if(atlasCache.has(size))return atlasCache.get(size);
  const pixels=[],m=32000/size;for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels.push(terrainAt((x+.5)*m,(y+.5)*m).index);
  const result=Object.freeze({size,metresPerPixel:m,pixels:Object.freeze(pixels)});atlasCache.set(size,result);return result;
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
