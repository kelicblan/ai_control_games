import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {Point,Npc} from '../simulation/types';
import type {MoveResult} from '../simulation/physics';
import type {ForestExpansion} from './forestExpansion';
export interface NewWorldData {version:1; id:string; minX:number;minY:number;step:number;width:number;height:number; heights:number[];walkable:number[];spawn:Point;center:Point;gate:Point;locations:Record<string,Point>;npcSpawns:Point[];restPoints:Point[];outline:Point[];houses?:{id:string;center:Point;half:Point;height:number;rest:Point}[];forestExpansion?:ForestExpansion}
export const newWorld:NewWorldData|null=process.env.CAMP_WORLD_LAYOUT==='new-world-v1'?JSON.parse(readFileSync(path.resolve(process.env.CAMP_NEW_WORLD_DATA??'native/ArtSource/new-world-runtime.json'),'utf8')):null;
if(newWorld&&(newWorld.version!==1||newWorld.id!=='new-world-v1'||newWorld.walkable.length!==newWorld.width*newWorld.height||newWorld.heights.length!==newWorld.walkable.length))throw new Error('Invalid new world collision export');
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function insideOutline(p:Point){let inside=false;const poly=newWorld!.outline;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i].y>p.y)!==(poly[j].y>p.y)&&p.x<(poly[j].x-poly[i].x)*(p.y-poly[i].y)/(poly[j].y-poly[i].y)+poly[i].x)inside=!inside;return inside;}
function cell(p:Point):number {const m=newWorld!;const x=Math.round((p.x-m.minX)/m.step),y=Math.round((p.y-m.minY)/m.step);return x<0||y<0||x>=m.width||y>=m.height?-1:y*m.width+x;}
export function newWorldHeight(p:Point):number {
 const stair=(newWorld as (NewWorldData&{stairRepair?:{bottom:Point;top:Point;halfWidth?:number;profile?:number[]}})|null)?.stairRepair;
 if(stair?.profile?.length&&stair.profile.length>1){const dx=stair.top.x-stair.bottom.x,dy=stair.top.y-stair.bottom.y,length=Math.hypot(dx,dy),px=p.x-stair.bottom.x,py=p.y-stair.bottom.y,t=(px*dx+py*dy)/(length*length),lateral=Math.abs(px*dy-py*dx)/length;if(t>=0&&t<=1&&lateral<=(stair.halfWidth??0)){const at=t*(stair.profile.length-1),i=Math.floor(at);return stair.profile[i]+(stair.profile[Math.min(i+1,stair.profile.length-1)]-stair.profile[i])*(at-i);}}
 const i=cell(p);return i<0?0:newWorld!.heights[i];
}
export function newWorldWalkable(p:Point,gateOpen=true):boolean {const i=cell(p);return i>=0&&newWorld!.walkable[i]===1&&(gateOpen||distance(p,newWorld!.gate)>3);}
export function newWorldTraverse(a:Point,b:Point,gateOpen=true):boolean {if(!Number.isFinite(a.x+a.y+b.x+b.y))return false;const d=distance(a,b),n=Math.max(1,Math.ceil(d/.2));if(n>5000)return false;const side=gateOpen?false:insideOutline(a);let previous=newWorldHeight(a);for(let i=0;i<=n;i++){const p={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n};if(!newWorldWalkable(p,gateOpen)||!gateOpen&&insideOutline(p)!==side)return false;const h=newWorldHeight(p);if(i&&Math.abs(h-previous)>.45)return false;previous=h;}return true;}
export function newWorldProject(p:Point,gateOpen=true):Point {if(newWorldWalkable(p,gateOpen))return {...p};const m=newWorld!;let best:Point|undefined,bestD=Infinity;for(let i=0;i<m.walkable.length;i++)if(m.walkable[i]){const c={x:m.minX+i%m.width*m.step,y:m.minY+Math.floor(i/m.width)*m.step};const d=distance(c,p);if(d<bestD&&newWorldWalkable(c,gateOpen)){best=c;bestD=d;}}if(!best)throw new Error('New world has no walkable cells');return best;}
interface Flow {parent:Int32Array;queue:Int32Array;head:number;tail:number}
const flows=new Map<string,Flow>();
/** Lazy reverse search on the exported physical grid. Long forest trips must not inherit a 128m local search limit. */
export function newWorldRoute(from:Point,target:Point,gateOpen=true):Point[]{
 const m=newWorld;if(!m||!newWorldWalkable(from,gateOpen)||!newWorldWalkable(target,gateOpen))return [];
 const side=gateOpen?false:insideOutline(from);if(!gateOpen&&insideOutline(target)!==side)return [];
 if(newWorldTraverse(from,target,gateOpen))return [{...target}];
 const start=cell(from),goal=cell(target),point=(i:number):Point=>({x:m.minX+i%m.width*m.step,y:m.minY+Math.floor(i/m.width)*m.step});
 if(!newWorldTraverse(from,point(start),gateOpen)||!newWorldTraverse(point(goal),target,gateOpen))return [];
 const key=`${goal}:${gateOpen}`,cached=flows.get(key);let flow=cached;
 if(!flow){const parent=new Int32Array(m.walkable.length);parent.fill(-1);flow={parent,queue:new Int32Array(parent.length),head:0,tail:1};parent[goal]=goal;flow.queue[0]=goal;flows.set(key,flow);if(flows.size>4)flows.delete(flows.keys().next().value!);}
 while(flow.head<flow.tail&&flow.parent[start]<0){
  const i=flow.queue[flow.head++],x=i%m.width,y=Math.floor(i/m.width);
  for(const n of [x>0?i-1:-1,x<m.width-1?i+1:-1,y>0?i-m.width:-1,y<m.height-1?i+m.width:-1]){
   if(n<0||flow.parent[n]>=0||m.walkable[n]!==1||Math.abs(m.heights[n]-m.heights[i])>.45||!gateOpen&&(distance(point(n),m.gate)<=3||insideOutline(point(n))!==side))continue;
   flow.parent[n]=i;flow.queue[flow.tail++]=n;
  }
 }
 if(flow.parent[start]<0)return [];
 const raw:Point[]=[point(start)];let at=start;
 while(at!==goal){at=flow.parent[at];raw.push(point(at));if(raw.length>m.walkable.length)throw Error('Cyclic new-world route');}
 raw.push({...target});const result:Point[]=[];let previous=from,index=0;
 while(index<raw.length){let next=Math.min(raw.length-1,index+32);while(next>index&&!newWorldTraverse(previous,raw[next],gateOpen))next--;if(!newWorldTraverse(previous,raw[next],gateOpen))return [];result.push(raw[next]);previous=raw[next];index=next+1;}
 return result;
}
export function newWorldMove(npc:Npc,target:Point,speed:number,dt:number,peers:readonly Npc[],manual=false,gateOpen=true):MoveResult {
 let goal=target;let plan=npc.worldRoute;
 if(!newWorldTraverse(npc.position,target,gateOpen)){
  // An empty result is a failed/finished search, not permission to rebuild A* every tick.
  // Keep its simulation-time retry delay; moving targets still invalidate immediately.
  if(!plan||distance(plan.target,target)>.2||plan.stalledFor>=2){const route=newWorldRoute(npc.position,newWorldProject(target,gateOpen),gateOpen);plan={target:{...target},waypoints:route,stalledFor:0};npc.worldRoute=plan;}
  while(plan.waypoints.length&&distance(npc.position,plan.waypoints[0])<.15)plan.waypoints.shift();goal=plan.waypoints[0]??npc.position;
 }else delete npc.worldRoute;
 const gap=distance(npc.position,goal),travel=Math.min(Math.max(0,speed*dt),gap),n=Math.max(1,Math.ceil(travel/.15));let position={...npc.position};
 for(let i=0;i<n&&gap>0;i++){const next={x:position.x+(goal.x-npc.position.x)/gap*travel/n,y:position.y+(goal.y-npc.position.y)/gap*travel/n};if(!newWorldTraverse(position,next,gateOpen))break;if(!manual&&peers.some(p=>p.id!==npc.id&&p.alive&&distance(next,p.position)<.5))break;position=next;}
 const moved=distance(npc.position,position);if(plan)plan.stalledFor=moved<.01?plan.stalledFor+dt:0;return {position,distanceMoved:moved,contacts:[],arrived:distance(position,target)<.25};
}
