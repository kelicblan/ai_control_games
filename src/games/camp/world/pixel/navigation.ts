import {findGridRoute} from '../../../../../packages/world-core/src/navigation';
// @ts-expect-error Native ESM map generator is shared with the Node map host.
import {isBlocked,VILLAGE,buildings} from './world.mjs';
import type {Point} from '../../simulation/types';
export const pixelLayout=process.env.CAMP_WORLD_LAYOUT==='pixel-world-v1';
export const pixelVillage=VILLAGE as {x:number;y:number;spawn:Point;gate:Point};
export const pixelBuildings=buildings() as {id:string;kind:string;door:Point;x:number;y:number;width:number;depth:number}[];
export function pixelTraverse(a:Point,b:Point,gateOpen=true){
 const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.3);if(n>120000||!Number.isFinite(n))return false;
 for(let i=0;i<=n;i++){const t=n?i/n:0;if(isBlocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,{gateOpen}))return false;}return true;
}
export function pixelProject(p:Point,gateOpen=true):Point{
 if(!isBlocked(p.x,p.y,{gateOpen}))return {...p};
 for(let r=1;r<=256;r++)for(let i=0;i<32;i++){const q={x:p.x+Math.cos(i*Math.PI/16)*r,y:p.y+Math.sin(i*Math.PI/16)*r};if(!isBlocked(q.x,q.y,{gateOpen}))return q;}
 throw new Error('新地图附近无安全站位，迁移已停止');
}
export function pixelRoute(a:Point,b:Point,gateOpen=true,maxNodes=8192,maxDistance=4096):Point[]{
 if(Math.hypot(a.x-b.x,a.y-b.y)>maxDistance)return [];
 if(!pixelTraverse(a,a,gateOpen)||!pixelTraverse(b,b,gateOpen))return [];
 if(pixelTraverse(a,b,gateOpen))return [{...b}];
 const step=Math.hypot(a.x-b.x,a.y-b.y)>256?4:2;
 // Anchor every search to the same world grid so workers share collision-edge checks.
 const start={x:Math.round(a.x/step)*step,y:Math.round(a.y/step)*step};
 const origin=pixelTraverse(a,start,gateOpen)?start:a;
 const route=findGridRoute(origin,b,(x,y)=>cachedEdge(x,y,gateOpen),{step,maxNodes,maxDistance});
 return route.reached?[...(origin===a?[]:[origin]),...route.points]:[];
}
const edges=new Map<string,boolean>();
function cachedEdge(a:Point,b:Point,open:boolean){
 const from=`${a.x},${a.y}`,to=`${b.x},${b.y}`,key=`${open}:${from<to?from+':'+to:to+':'+from}`;
 const old=edges.get(key);if(old!==undefined)return old;const result=pixelTraverse(a,b,open);if(edges.size>=65536)edges.delete(edges.keys().next().value!);edges.set(key,result);return result;
}
export function fromPreviousMap(p:Point):Point{return {x:pixelVillage.x+p.x-50,y:pixelVillage.y-(p.y-42)};}

export function pixelMigrationProject(p:Point):Point{
 if(!isBlocked(p.x,p.y,{gateOpen:true}))return {...p};
 for(let r=2;r<=8192;r=r<64?r+2:r+64)for(let i=0;i<32;i++){
  const q={x:p.x+Math.cos(i*Math.PI/16)*r,y:p.y+Math.sin(i*Math.PI/16)*r};
  if(q.x>1&&q.y>1&&q.x<31999&&q.y<31999&&!isBlocked(q.x,q.y,{gateOpen:true}))return q;
 }
 throw new Error('参考地图迁移没有找到安全站位');
}
