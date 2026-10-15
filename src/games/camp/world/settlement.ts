import type {TerrainObject} from '../simulation/terrain';
import {landscapeRoad} from './landscape';
import {VILLAGE_PATHS,villageClearance} from './villageLayout';

/** Metres, shared by palisade rendering and authoritative movement. */
export const SETTLEMENT_RADIUS=150;
export const SETTLEMENT_GATE=Object.freeze({x:50,y:205});
export const SETTLEMENT_GATE_HALF_WIDTH=9;
export const WATCHTOWER=Object.freeze({center:{x:24,y:199},half:{x:6,y:6},height:31});
// One continuous, axis-aligned rectangular boundary, terminating inside
// the gate posts. Rendering and collision consume these exact same segments.
export const SETTLEMENT_OUTLINE=[{x:39,y:205},{x:-105,y:205},{x:-105,y:-101},
 {x:205,y:-101},{x:205,y:205},{x:61,y:205}];
export const SETTLEMENT_WALL_SEGMENTS=SETTLEMENT_OUTLINE.slice(1).flatMap((end,index)=>{
 const start=SETTLEMENT_OUTLINE[index],distance=Math.hypot(end.x-start.x,end.y-start.y),count=Math.ceil(distance/8);
 return Array.from({length:count},(_,i)=>({start:{x:start.x+(end.x-start.x)*i/count,y:start.y+(end.y-start.y)*i/count},
  end:{x:start.x+(end.x-start.x)*(i+1)/count,y:start.y+(end.y-start.y)*(i+1)/count}}));
});
export const SETTLEMENT_WALLS:readonly TerrainObject[]=SETTLEMENT_WALL_SEGMENTS.map(({start,end},i)=>({
 id:`palisade-${i}`,kind:'house',label:'木制寨墙',solid:true,
 navigationPoints:i===0?[{x:50,y:187},{x:50,y:222},{x:50,y:242},{x:50,y:296}]:[],
 shape:{type:'aabb',center:{x:(start.x+end.x)/2,y:(start.y+end.y)/2},half:{x:Math.abs(end.x-start.x)/2+1.55,y:Math.abs(end.y-start.y)/2+1.55}},
}));
export const SETTLEMENT_GATE_COLLIDER:TerrainObject={id:'settlement-gate',kind:'house',label:'关闭的寨门',solid:true,
 shape:{type:'aabb',center:SETTLEMENT_GATE,half:{x:SETTLEMENT_GATE_HALF_WIDTH,y:1.1}}};
export function insideSettlement(x:number,y:number,margin=0):boolean {
 let inside=false;
 for(let i=0,j=SETTLEMENT_OUTLINE.length-1;i<SETTLEMENT_OUTLINE.length;j=i++){
  const a=SETTLEMENT_OUTLINE[i],b=SETTLEMENT_OUTLINE[j];
  if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
  if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<margin)return true;
 }return inside;
}

export const PLANTED_TREES=[
 [-8,-38],[-78,32],[-45,35],[-45,94],[-88,100],[-90,159],
 [100,37],[133,40],[145,40],[115,105],[110,155],[112,178],
 [16,-70],[84,-70],[-82,-65],[-45,-60],[5,175],[85,175],
].filter(([x,y])=>!villageClearance(x,y,6)&&landscapeRoad(x,y)===0)
 .map(([x,y],i)=>({point:{x,y},size:17+i%4*2,kind:i%3===0?'pine' as const:'broadleaf' as const}));

export const MOUNTAIN_MASSES=[
 {point:{x:-260,y:-175},width:125,depth:105,height:140,angle:.3},
 {point:{x:-110,y:-230},width:145,depth:125,height:180,angle:-.4},
 {point:{x:60,y:-270},width:155,depth:135,height:205,angle:.7},
 {point:{x:240,y:-210},width:145,depth:120,height:175,angle:-.7},
 {point:{x:410,y:-290},width:175,depth:155,height:235,angle:1.3},
];

/** Plateau and southern ramp are sampled by ground, homes and actor feet. */
export function manorGround(x:number,y:number):number {
 const across=Math.max(0,Math.min(1,(43-Math.abs(x-50))/12));
 const north=Math.max(0,Math.min(1,(y+90)/16));
 const south=Math.max(0,Math.min(1,(20-y)/34));
 return 8*across*north*south;
}

export const SETTLEMENT_PATHS:readonly (readonly [{x:number;y:number},{x:number;y:number}])[]=[
 [{x:50,y:320},{x:50,y:-26}],
 ...VILLAGE_PATHS,
];
export function settlementRoad(x:number,y:number):number {
 return landscapeRoad(x,y);
}
