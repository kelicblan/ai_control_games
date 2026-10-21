import {newWorld,newWorldTraverse,newWorldProject,newWorldMove} from './newWorldProfile';
import {SETTLEMENT_GATE_COLLIDER,insideSettlement} from './settlement';
import { wildernessSites } from './wildernessSites';
import { findGridRoute } from '../../../../packages/world-core/src/navigation';
import { validPoint } from '../../../../packages/world-core/src';
import { createPhysics, type MoveResult } from '../simulation/physics';
import { TERRAIN, NPC_RADIUS, type TerrainObject } from '../simulation/terrain';
import type { Npc, Point } from '../simulation/types';
import { CAMP_CENTER, BRIDGE_INTERVAL, bridgeAt, riverCenter, riverHalfWidth, treeAt, walkingHeight,GATE_BRIDGE,isOnBridge,sampleCampSurface } from './definition';

const gap=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const radius=(p:Point)=>gap(p,CAMP_CENTER);
const creek=TERRAIN.find(object=>object.id==='deep-creek')!;
/** 一条河可以有多个接触面；逻辑ID保持deep-creek以保留既有伤害与存档语义。 */
function riverPart(a:number,b:number):TerrainObject {
  const xa=riverCenter(a),xb=riverCenter(b),width=Math.max(riverHalfWidth(a),riverHalfWidth(b));
  return {...creek,solid:false,navigationPoints:[],shape:{type:'aabb',center:{x:(xa+xb)/2,y:(a+b)/2},half:{x:width+Math.abs(xb-xa)/2,y:(b-a)/2}}};
}
/** Cut only the physical north/south bridge rectangle out of river obstacles. */
function riverParts(a:number,b:number):TerrainObject[]{
 const object=riverPart(a,b),s=object.shape;if(s.type!=='aabb')return [object];
 if(a>=GATE_BRIDGE.point.y-GATE_BRIDGE.halfLength&&b<=GATE_BRIDGE.point.y+GATE_BRIDGE.halfLength){
  const low=s.center.x-s.half.x,high=s.center.x+s.half.x,left=GATE_BRIDGE.point.x-GATE_BRIDGE.halfWidth,right=GATE_BRIDGE.point.x+GATE_BRIDGE.halfWidth;
  return [[low,Math.min(left,high)],[Math.max(right,low),high]].filter(([l,r])=>r>l).map(([l,r])=>({...object,shape:{type:'aabb',center:{x:(l+r)/2,y:s.center.y},half:{x:(r-l)/2,y:s.half.y}}}));
 }return [object];
}
const campRiver:TerrainObject[]=[];
const campRows=[...Array.from({length:129},(_,i)=>-200+i*4),GATE_BRIDGE.point.y-GATE_BRIDGE.halfLength,GATE_BRIDGE.point.y+GATE_BRIDGE.halfLength].sort((a,b)=>a-b);
for(let i=0;i<campRows.length-1;i++){
 const a=campRows[i],b=campRows[i+1];if(a===b)continue;
 // Use exact bridge borders rather than leaving a partially blocked deck row.
 for(const [low,high] of [[a,Math.min(b,49)],[Math.max(a,61),b]])if(high>low)campRiver.push(...riverParts(low,high));
}
const campObjects=[...TERRAIN.filter(object=>object.id!=='deep-creek'),...campRiver];
const openCampPhysics=createPhysics(campObjects);
const campPhysics=openCampPhysics;
const closedCampPhysics=createPhysics([...campObjects,SETTLEMENT_GATE_COLLIDER]);
/** 缓存只保留有限数量的局部碰撞窗口，丢弃后可从种子重建，不污染存档。 */
const windows=new Map<string,ReturnType<typeof createPhysics>>();
function physicsAt(point:Point,seed:number,gateOpen=true):ReturnType<typeof createPhysics> {
  if(radius(point)<160||insideSettlement(point.x,point.y))return gateOpen?campPhysics:closedCampPhysics;
  const cx=Math.floor(point.x/64),cy=Math.floor(point.y/64),key=`${seed}:${gateOpen}:${cx}:${cy}`;
  const cached=windows.get(key);if(cached){windows.delete(key);windows.set(key,cached);return cached;}
  const minX=(cx-1)*64,maxX=(cx+2)*64,minY=(cy-1)*64,maxY=(cy+2)*64;
  const objects:TerrainObject[]=TERRAIN.filter(object=>object.id!=='deep-creek'
    && object.shape.center.x>minX-20&&object.shape.center.x<maxX+20&&object.shape.center.y>minY-20&&object.shape.center.y<maxY+20);
  for(const site of wildernessSites(seed))if(site.kind==='wood'&&site.position.x>minX&&site.position.x<maxX&&site.position.y>minY&&site.position.y<maxY)
    objects.push({id:`harvest-${site.id}`,kind:'tree',label:'采伐树木',solid:true,shape:{type:'circle',center:site.position,radius:.85}});
  for(let y=Math.floor(minY/20)-1;y<=Math.floor(maxY/20)+1;y++)for(let x=Math.floor(minX/20)-1;x<=Math.floor(maxX/20)+1;x++){
    const tree=treeAt(x,y,seed);if(!tree)continue;
    objects.push({id:`world-tree:${x}:${y}`,kind:'tree',label:'树林',solid:true,
      shape:{type:'circle',center:tree.point,radius:tree.size*.0665}});
  }
  const rows:number[]=[];for(let y=minY;y<=maxY;y+=4)rows.push(y);
  for(const y of [GATE_BRIDGE.point.y-GATE_BRIDGE.halfLength,GATE_BRIDGE.point.y+GATE_BRIDGE.halfLength])if(y>minY&&y<maxY)rows.push(y);
  for(let index=Math.ceil((minY-61)/BRIDGE_INTERVAL);index<=Math.floor((maxY-49)/BRIDGE_INTERVAL);index++){
    const bridge=bridgeAt(index);for(const y of [bridge.point.y-6,bridge.point.y+6])if(y>minY&&y<maxY)rows.push(y);
  }
  rows.sort((a,b)=>a-b);
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1],middle=(a+b)/2;if(a===b)continue;
    if(Math.abs(middle-bridgeAt(Math.round((middle-55)/BRIDGE_INTERVAL)).point.y)<6)continue;
    for(const object of riverParts(a,b))if(object.shape.type==='aabb'&&object.shape.center.x+object.shape.half.x>=minX
      && object.shape.center.x-object.shape.half.x<=maxX)objects.push(object);
  }
  if(!gateOpen)objects.push(SETTLEMENT_GATE_COLLIDER);
  const value=createPhysics(objects);windows.set(key,value);
  while(windows.size>48)windows.delete(windows.keys().next().value!);
  return value;
}
/** 显示出来的树干、实体房屋、深水和坡度同时参与可走判定。 */
export function worldCanTraverse(from:Point,to:Point,seed:number,gateOpen=true):boolean {
  if(newWorld)return newWorldTraverse(from,to,gateOpen);
  if(!validPoint(from)||!validPoint(to))return false;
  const distance=gap(from,to),steps=Math.max(1,Math.ceil(distance/1.5));
  if(steps>2048)return false; // 大段路线由有预算的规划器分段，不线性扫描无限距离。
  let previous=walkingHeight(from,seed);
  for(let i=0;i<=steps;i++){
    const point={x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps};
    if(sampleCampSurface(point,seed).water&&!isOnBridge(point))return false;
    if(!physicsAt(point,seed,gateOpen).isWalkable(point,true,.15))return false;
    const height=walkingHeight(point,seed);
    if(i>0&&Math.abs(height-previous)>Math.max(.03,distance/steps*.75))return false;
    previous=height;
  }
  return true;
}

/** Repair only against physical geography; camera/exploration never participates. */
export function repairWorldPosition(point:Point,seed:number,gateOpen=true):Point {
 if(newWorld)return newWorldProject(point,gateOpen);
 if(sampleCampSurface(point,seed).water&&!isOnBridge(point)){
  const center=riverCenter(point.y),side=Math.sign(point.x-center)||Math.sign(CAMP_CENTER.x-center)||1;
  point={x:center+side*(riverHalfWidth(point.y)+NPC_RADIUS+(creek.hazard?.reach??0)+.5),y:point.y};
 }
 return physicsAt(point,seed,gateOpen).projectToWalkable(point,true,undefined,.35);
}
/** 跨河先找实际桥头；世界路径不能靠相机位置或未知区的空模型来判定。 */
function strategicTarget(from:Point,to:Point):Point {
  const fromInside=insideSettlement(from.x,from.y),toInside=insideSettlement(to.x,to.y);
  if(fromInside&&!toInside){
    if(from.y<188||Math.abs(from.x-50)>3)return {x:50,y:190};
    return {x:50,y:225};
  }
  // Complete the actual gate bridge before turning toward a moving or off-axis work target.
  // Replanning a hunt every wildlife tick must not route back to the old camp bridge.
  if(!toInside&&to.y>300&&from.y>=190&&from.y<295&&Math.abs(from.x-50)<50){
    return {x:50,y:from.y<246?246:295};
  }
  if(!fromInside&&toInside){
    if(from.y>295)return strategicTarget(from,{x:50,y:295});
    if(from.y>222||Math.abs(from.x-50)>3)return {x:50,y:222};
    return {x:50,y:190};
  }
  if(Math.abs(from.x-50)<40&&Math.abs(to.x-50)<40&&Math.min(from.y,to.y)<GATE_BRIDGE.point.y&&Math.max(from.y,to.y)>GATE_BRIDGE.point.y){
    const entrance={x:50,y:GATE_BRIDGE.point.y+Math.sign(from.y-GATE_BRIDGE.point.y)*(GATE_BRIDGE.halfLength+5)};
    if(gap(from,entrance)>2&&Math.abs(from.y-GATE_BRIDGE.point.y)>GATE_BRIDGE.halfLength+2)return entrance;
    return {x:50,y:GATE_BRIDGE.point.y+Math.sign(to.y-GATE_BRIDGE.point.y)*(GATE_BRIDGE.halfLength+5)};
  }
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
export function moveWorldBody(npc:Npc,target:Point,speed:number,dt:number,peers:readonly Npc[],seed:number,manual=false,gateOpen=true):MoveResult {
  if(newWorld)return newWorldMove(npc,target,speed,dt,peers,manual,gateOpen);
  if((radius(npc.position)<160||insideSettlement(npc.position.x,npc.position.y))&&(radius(target)<160||insideSettlement(target.x,target.y))){
    const campPhysics=gateOpen?openCampPhysics:closedCampPhysics;
    delete npc.worldRoute;
    return campPhysics.moveBody(npc.position,target,speed,dt,peers,npc.id,{manual,avoidHazards:!manual||campPhysics.isWalkable(target,true,.35)});
  }
  const physics=physicsAt(npc.position,seed,gateOpen);
  // A route search cannot replace contact handling at an existing overlap, or
  // a nearby deliberate click on a hazard. Keep physical injury/reflex behavior.
  if(!physics.isWalkable(npc.position,false)||sampleCampSurface(npc.position,seed).water&&!isOnBridge(npc.position)||manual&&gap(npc.position,target)<32&&sampleCampSurface(target,seed).water&&!isOnBridge(target)){
    delete npc.worldRoute;
    return physics.moveBody(npc.position,target,speed,dt,peers,npc.id,{manual,avoidHazards:!manual});
  }
  if(speed<=0||dt<=0)return physics.moveBody(npc.position,npc.position,0,dt,peers,npc.id,{manual});
  let plan=npc.worldRoute;
  const targetTolerance=!manual&&npc.wildTask?.kind==='hunt'?6:.05;
  if(!plan||gap(plan.target,target)>targetTolerance||plan.stalledFor>2){plan={target:{...target},waypoints:[],stalledFor:0};npc.worldRoute=plan;}
  while(plan.waypoints.length&&gap(npc.position,plan.waypoints[0])<.2)plan.waypoints.shift();
  if(!plan.waypoints.length){
    let goal=strategicTarget(npc.position,target);
    if(radius(npc.position)<160){
      // 先经过本地精确导航出营；8米外围网格不能代替5米宽的房门。
      if(radius(goal)>170){const d=gap(CAMP_CENTER,goal);goal={x:CAMP_CENTER.x+(goal.x-CAMP_CENTER.x)*170/d,y:CAMP_CENTER.y+(goal.y-CAMP_CENTER.y)*170/d};}
      plan.waypoints=[goal];
    }else{
      if(radius(goal)<145){const d=radius(npc.position);goal={x:CAMP_CENTER.x+(npc.position.x-CAMP_CENTER.x)*145/d,y:CAMP_CENTER.y+(npc.position.y-CAMP_CENTER.y)*145/d};}
      const route=findGridRoute(npc.position,goal,(a,b)=>worldCanTraverse(a,b,seed,gateOpen),{step:8,maxNodes:1024,maxDistance:192});
      plan.waypoints=route.points.slice(0,128);
    }
  }
  const waypoint=plan.waypoints[0];
  if(!waypoint){plan.stalledFor+=dt;return {position:{...npc.position},distanceMoved:0,contacts:[],arrived:gap(npc.position,target)<.15};}
  const final=gap(waypoint,target)<.05;
  const result=physics.moveBody(npc.position,waypoint,speed,dt,peers,npc.id,{manual:manual&&final});
  // 避人转向也不能把角色挤上陡坡或桥外；连续实体扫掠仍由同一物理层完成。
  if(radius(npc.position)>=160&&!worldCanTraverse(npc.position,result.position,seed,gateOpen)){
    plan.stalledFor+=dt;return {position:{...npc.position},distanceMoved:0,contacts:[],arrived:false};
  }
  plan.stalledFor=result.distanceMoved<.01?plan.stalledFor+dt:0;
  if(result.arrived)plan.waypoints.shift();
  const arrived=(final&&result.arrived)||gap(result.position,target)<.15;
  if(arrived)delete npc.worldRoute;
  return {...result,arrived};
}
/** 分离近邻群体时也使用人物所在窗口的实体，镜头不参与物理更新。 */
export function separateWorldNpcs(npcs:Npc[],seed:number,gateOpen=true):void {
  if(newWorld){for(const npc of npcs)if(npc.alive&&!newWorldTraverse(npc.position,npc.position,gateOpen))npc.position=newWorldProject(npc.position,gateOpen);return;}
  if(npcs.every(n=>radius(n.position)<160||insideSettlement(n.position.x,n.position.y))){(gateOpen?campPhysics:closedCampPhysics).separateNpcs(npcs);return;}
  for(const npc of npcs)if(npc.alive){
    const nearby=npcs.filter(other=>other.alive&&gap(other.position,npc.position)<NPC_RADIUS*8);
    if(nearby.length>1)physicsAt(npc.position,seed,gateOpen).separateNpcs(nearby);
  }
}
