import { findGridRoute } from '../../../../packages/world-core/src/navigation';
import { validPoint } from '../../../../packages/world-core/src';
import { createPhysics, type MoveResult } from '../simulation/physics';
import { TERRAIN, NPC_RADIUS, type TerrainObject } from '../simulation/terrain';
import type { Npc, Point } from '../simulation/types';
import { CAMP_CENTER, BRIDGE_INTERVAL, bridgeAt, riverCenter, riverHalfWidth, treeAt, walkingHeight } from './definition';

const gap=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const radius=(p:Point)=>gap(p,CAMP_CENTER);
const creek=TERRAIN.find(object=>object.id==='deep-creek')!;
/** 一条河可以有多个接触面；逻辑ID保持deep-creek以保留既有伤害与存档语义。 */
function riverPart(a:number,b:number):TerrainObject {
  const xa=riverCenter(a),xb=riverCenter(b),width=Math.max(riverHalfWidth(a),riverHalfWidth(b));
  return {...creek,solid:true,shape:{type:'aabb',center:{x:(xa+xb)/2,y:(a+b)/2},half:{x:width+Math.abs(xb-xa)/2,y:(b-a)/2}}};
}
const campObjects=[...TERRAIN.filter(object=>object.id!=='deep-creek'),riverPart(-110,49),riverPart(61,210)];
const campPhysics=createPhysics(campObjects);
/** 缓存只保留有限数量的局部碰撞窗口，丢弃后可从种子重建，不污染存档。 */
const windows=new Map<string,ReturnType<typeof createPhysics>>();
function physicsAt(point:Point,seed:number):ReturnType<typeof createPhysics> {
  if(radius(point)<122)return campPhysics;
  const cx=Math.floor(point.x/64),cy=Math.floor(point.y/64),key=`${seed}:${cx}:${cy}`;
  const cached=windows.get(key);if(cached){windows.delete(key);windows.set(key,cached);return cached;}
  const minX=(cx-1)*64,maxX=(cx+2)*64,minY=(cy-1)*64,maxY=(cy+2)*64;
  const objects:TerrainObject[]=TERRAIN.filter(object=>object.id!=='deep-creek'
    && object.shape.center.x>minX-20&&object.shape.center.x<maxX+20&&object.shape.center.y>minY-20&&object.shape.center.y<maxY+20);
  for(let y=Math.floor(minY/20)-1;y<=Math.floor(maxY/20)+1;y++)for(let x=Math.floor(minX/20)-1;x<=Math.floor(maxX/20)+1;x++){
    const tree=treeAt(x,y,seed);if(!tree)continue;
    objects.push({id:`world-tree:${x}:${y}`,kind:'tree',label:'树林',solid:true,
      shape:{type:'circle',center:tree.point,radius:tree.size*.0665}});
  }
  const rows:number[]=[];for(let y=minY;y<=maxY;y+=4)rows.push(y);
  for(let index=Math.ceil((minY-61)/BRIDGE_INTERVAL);index<=Math.floor((maxY-49)/BRIDGE_INTERVAL);index++){
    const bridge=bridgeAt(index);for(const y of [bridge.point.y-6,bridge.point.y+6])if(y>minY&&y<maxY)rows.push(y);
  }
  rows.sort((a,b)=>a-b);
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1],middle=(a+b)/2;if(a===b)continue;
    if(Math.abs(middle-bridgeAt(Math.round((middle-55)/BRIDGE_INTERVAL)).point.y)<6)continue;
    const object=riverPart(a,b);if(object.shape.type==='aabb'&&object.shape.center.x+object.shape.half.x>=minX
      && object.shape.center.x-object.shape.half.x<=maxX)objects.push(object);
  }
  const value=createPhysics(objects);windows.set(key,value);
  while(windows.size>48)windows.delete(windows.keys().next().value!);
  return value;
}
/** 显示出来的树干、实体房屋、深水和坡度同时参与可走判定。 */
export function worldCanTraverse(from:Point,to:Point,seed:number):boolean {
  if(!validPoint(from)||!validPoint(to))return false;
  const distance=gap(from,to),steps=Math.max(1,Math.ceil(distance/1.5));
  if(steps>2048)return false; // 大段路线由有预算的规划器分段，不线性扫描无限距离。
  let previous=walkingHeight(from,seed);
  for(let i=0;i<=steps;i++){
    const point={x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps};
    if(!physicsAt(point,seed).isWalkable(point,true,.15))return false;
    const height=walkingHeight(point,seed);
    if(i>0&&Math.abs(height-previous)>Math.max(.03,distance/steps*.75))return false;
    previous=height;
  }
  return true;
}
/** 跨河先找实际桥头；世界路径不能靠相机位置或未知区的空模型来判定。 */
function strategicTarget(from:Point,to:Point):Point {
  const a=from.x-riverCenter(from.y),b=to.x-riverCenter(to.y);
  if(Math.sign(a)!==Math.sign(b) && Math.abs(b)>riverHalfWidth(to.y)+2){
    const bridge=bridgeAt(Math.round(((from.y+to.y)/2-55)/BRIDGE_INTERVAL));
    const entrance={x:bridge.point.x+Math.sign(a)*(bridge.halfLength+3),y:bridge.point.y};
    if(gap(from,entrance)>3 && (Math.abs(from.y-bridge.point.y)>2||Math.abs(a)>bridge.halfLength+2))return entrance;
    return {x:bridge.point.x-Math.sign(a)*(bridge.halfLength+3),y:bridge.point.y};
  }
  // 已过河心还要走出桥面，避免立刻斜转进入桥侧深水。
  const bridge=bridgeAt(Math.round((from.y-55)/BRIDGE_INTERVAL));
  if(Math.abs(from.y-bridge.point.y)<6&&Math.abs(a)<bridge.halfLength+1)
    return {x:bridge.point.x+(Math.sign(b)||1)*(bridge.halfLength+3),y:bridge.point.y};
  return to;
}
/** 局部图保留营地窄门精度；外围分段A*不为遥远目的地分配整张世界图。 */
export function moveWorldBody(npc:Npc,target:Point,speed:number,dt:number,peers:readonly Npc[],seed:number,manual=false):MoveResult {
  if(radius(npc.position)<122&&radius(target)<122){
    delete npc.worldRoute;
    return campPhysics.moveBody(npc.position,target,speed,dt,peers,npc.id,{manual,avoidHazards:!manual||campPhysics.isWalkable(target,true,.35)});
  }
  const physics=physicsAt(npc.position,seed);
  if(speed<=0||dt<=0)return physics.moveBody(npc.position,npc.position,0,dt,peers,npc.id,{manual});
  let plan=npc.worldRoute;
  if(!plan||gap(plan.target,target)>.05||plan.stalledFor>2){plan={target:{...target},waypoints:[],stalledFor:0};npc.worldRoute=plan;}
  while(plan.waypoints.length&&gap(npc.position,plan.waypoints[0])<.2)plan.waypoints.shift();
  if(!plan.waypoints.length){
    let goal=strategicTarget(npc.position,target);
    if(radius(npc.position)<122){
      // 先经过本地精确导航出营；8米外围网格不能代替5米宽的房门。
      if(radius(goal)>130){const d=gap(CAMP_CENTER,goal);goal={x:CAMP_CENTER.x+(goal.x-CAMP_CENTER.x)*130/d,y:CAMP_CENTER.y+(goal.y-CAMP_CENTER.y)*130/d};}
      plan.waypoints=[goal];
    }else{
      if(radius(goal)<115){const d=radius(npc.position);goal={x:CAMP_CENTER.x+(npc.position.x-CAMP_CENTER.x)*110/d,y:CAMP_CENTER.y+(npc.position.y-CAMP_CENTER.y)*110/d};}
      const route=findGridRoute(npc.position,goal,(a,b)=>worldCanTraverse(a,b,seed),{step:8,maxNodes:1024,maxDistance:192});
      plan.waypoints=route.points.slice(0,128);
    }
  }
  const waypoint=plan.waypoints[0];
  if(!waypoint){plan.stalledFor+=dt;return {position:{...npc.position},distanceMoved:0,contacts:[],arrived:gap(npc.position,target)<.15};}
  const final=gap(waypoint,target)<.05;
  const result=physics.moveBody(npc.position,waypoint,speed,dt,peers,npc.id,{manual:manual&&final});
  // 避人转向也不能把角色挤上陡坡或桥外；连续实体扫掠仍由同一物理层完成。
  if(radius(npc.position)>=122&&!worldCanTraverse(npc.position,result.position,seed)){
    plan.stalledFor+=dt;return {position:{...npc.position},distanceMoved:0,contacts:[],arrived:false};
  }
  plan.stalledFor=result.distanceMoved<.01?plan.stalledFor+dt:0;
  if(result.arrived)plan.waypoints.shift();
  const arrived=(final&&result.arrived)||gap(result.position,target)<.15;
  if(arrived)delete npc.worldRoute;
  return {...result,arrived};
}
/** 分离近邻群体时也使用人物所在窗口的实体，镜头不参与物理更新。 */
export function separateWorldNpcs(npcs:Npc[],seed:number):void {
  if(npcs.every(n=>radius(n.position)<122)){campPhysics.separateNpcs(npcs);return;}
  for(const npc of npcs)if(npc.alive){
    const nearby=npcs.filter(other=>other.alive&&gap(other.position,npc.position)<NPC_RADIUS*8);
    if(nearby.length>1)physicsAt(npc.position,seed).separateNpcs(nearby);
  }
}
