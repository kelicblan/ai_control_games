import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMP_HOUSES, sampleCampSurface, treeAt, riverCenter, riverHalfWidth, bridgeAt, GATE_BRIDGE } from '../src/games/camp/world/definition';
import { LANDSCAPE_REVISION } from '../src/games/camp/world/landscape';
import { PLANTED_TREES, SETTLEMENT_GATE, SETTLEMENT_WALL_SEGMENTS, WATCHTOWER } from '../src/games/camp/world/settlement';
import { VILLAGE_FACILITIES, FACILITY_WALLS, villageClearance } from '../src/games/camp/world/villageLayout';
import { buildingWalls } from '../packages/world-core/src/buildings';
import { createGame } from '../src/games/camp/simulation/engine';
import { seeded } from '../src/scene/geometry';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Placement = { id:string; asset:string; category:string; position:number[]; size:number[]; yaw:number };
export function buildNativeSceneBlueprint(seed = 17) {
  const placements:Placement[]=[];
  const colliders:{owner:string;x:number;z:number;halfX:number;halfZ:number;height:number}[]=[];
  const add=(id:string,asset:string,category:string,x:number,z:number,size:number[],yaw=0)=>placements.push({id,asset,category,position:[x,sampleCampSurface({x,y:z},seed).height,z],size,yaw});
  for(const h of CAMP_HOUSES){
    add(h.id,h.id==='lord-house'?'valley/manor':'valley/cottage','home',h.center.x,h.center.y,[h.half.x*2+4,h.roofHeight,h.half.y*2+4]);
    for(const w of buildingWalls(h))colliders.push({owner:h.id,x:w.center.x,z:w.center.y,halfX:w.half.x,halfZ:w.half.y,height:h.wallHeight});
  }
  for(const f of VILLAGE_FACILITIES)add(f.id,`valley/${f.id}`,'facility',f.center.x,f.center.y,[f.half.x*2+4,f.height,f.half.y*2+4],90);
  for(const w of FACILITY_WALLS)colliders.push({owner:w.facilityId,x:w.center.x,z:w.center.y,halfX:w.half.x,halfZ:w.half.y,height:VILLAGE_FACILITIES.find(f=>f.id===w.facilityId)!.wallHeight || 2});
  add('gate','valley/gate','gate',SETTLEMENT_GATE.x,SETTLEMENT_GATE.y,[31,22,9],90);
  add('watchtower','valley/watchtower','watchtower',WATCHTOWER.center.x,WATCHTOWER.center.y,[13,31,13],90);
  SETTLEMENT_WALL_SEGMENTS.forEach(({start,end},i)=>{
    const x=(start.x+end.x)/2,z=(start.y+end.y)/2,length=Math.hypot(end.x-start.x,end.y-start.y)+.55;
    add(`palisade-${i}`,'valley/palisade','wall',x,z,[length,11,3.1],-Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI+90);
    colliders.push({owner:`palisade-${i}`,x,z,halfX:Math.abs(end.x-start.x)/2+1.55,halfZ:Math.abs(end.y-start.y)/2+1.55,height:11});
  });
  for(const [i,t] of PLANTED_TREES.entries())if(!villageClearance(t.point.x,t.point.y,8))add(`planted-${i}`,`valley/${t.kind}`,'planted',t.point.x,t.point.y,[0,t.size,0],i*98);
  for(let cy=-50;cy<=50;cy++)for(let cx=-50;cx<=50;cx++){
    const t=treeAt(cx,cy,seed);if(!t || Math.hypot(t.point.x-50,t.point.y-55)>1000)continue;
    add(`forest-${cx}-${cy}`,'valley/pine','forest',t.point.x,t.point.y,[0,t.size,0],(cx*131+cy*71)%360);
  }
  // Same deterministic planting and clearances as settlementScenery.ts.
  const random=seeded(291014);
  const blocked=(x:number,y:number,margin=0)=>villageClearance(x,y,margin)||CAMP_HOUSES.some(h=>Math.abs(x-h.center.x)<h.half.x+margin&&Math.abs(y-h.center.y)<h.half.y+margin)
    ||Math.abs(x-SETTLEMENT_GATE.x)<20&&y>165||Math.hypot(x-WATCHTOWER.center.x,y-WATCHTOWER.center.y)<12;
  for(let i=0;i<240;i++){
    const a=random()*Math.PI*2,r=120+random()*19,x=50+Math.cos(a)*r,y=55+Math.sin(a)*r,s=sampleCampSurface({x,y},seed);
    if(blocked(x,y,8)||s.water||s.road>.0)continue;
    add(`shrub-${i}`,'valley/bush','shrub',x,y,[0,1.3+random()*1.4,0],random()*360);
  }
  for(const h of CAMP_HOUSES.slice(1))for(const side of [-1,1])for(let i=0;i<3;i++){
    const x=h.center.x+side*(h.half.x+6),y=h.center.y-8+i*5;if(villageClearance(x,y,3))continue;
    add(`yard-${h.id}-${side}-${i}`,'valley/bush','shrub',x,y,[0,1.7+random()*.7,0],random()*360);
  }
  for(let i=0;i<650;i++){
    const x=-180+random()*460,y=-125+random()*460,s=sampleCampSurface({x,y},seed);
    if(blocked(x,y,8)||s.water||s.road>0||Math.abs(Math.hypot(x-50,y-55)-150)<5)continue;
    add(`grass-${i}`,'valley/grass','grass',x,y,[0,.7+random()*.75,0],random()*360);
  }
  for(let i=0;i<75;i++){
    const y=-230+random()*630,side=random()<.5?-1:1,x=riverCenter(y)+side*(riverHalfWidth(y)+1+random()*6),s=sampleCampSurface({x,y},seed);
    if(villageClearance(x,y,3)||s.road>0||s.water)continue;
    add(`rock-${i}`,'valley/rock','rock',x,y,[0,.6+random()*2,0],random()*360);
  }
  const state=createGame({seed});
  const characters=[{id:'lord',name:'领主',asset:'lord',position:[state.lord!.position.x,sampleCampSurface(state.lord!.position,seed).height,state.lord!.position.y],height:7.45},
    ...state.npcs.map(n=>({id:n.id,name:n.name,asset:`subjects/${n.id}`,position:[n.position.x,sampleCampSurface(n.position,seed).height,n.position.y],height:7.1}))];
  const river:{vertices:number[][];triangles:number[]}={vertices:[],triangles:[]};
  for(let z=-1152;z<=1152;z+=4){const x=riverCenter(z),w=riverHalfWidth(z),h=sampleCampSurface({x,y:z},seed).waterLevel;river.vertices.push([x-w,h,z],[x+w,h,z]);const n=river.vertices.length-2;if(n>0)river.triangles.push(n-2,n,n-1,n-1,n,n+1);}
  const bridges=[GATE_BRIDGE,...[-1,0,1].map(i=>bridgeAt(i))].map(b=>({position:[b.point.x,b.height,b.point.y],size:'axis' in b&&b.axis==='y'?[b.halfWidth*2,.7,b.halfLength*2]:[b.halfLength*2,.7,b.halfWidth*2]}));
  const files:string[]=[];const walk=(dir:string)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.name==='model.glb')files.push(f);}};walk(path.join(root,'public/assets/models'));
  const assets=files.sort().map(file=>{const id=path.relative(path.join(root,'public/assets/models'),path.dirname(file)).replaceAll('\\','/');return {id,source:path.relative(root,file).replaceAll('\\','/'),destination:`Assets/CampMind/Content/Models/${id}.glb`,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')};});
  return {version:1,seed,terrainRevision:LANDSCAPE_REVISION,coordinateMapping:'TS(x,y) -> Unity(x,height,y); imported terrain reverses glTFast X then adds (50,0,50)',assets,placements,colliders,characters,river,bridges};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const scene=buildNativeSceneBlueprint();const project=path.join(root,'native/CampMind.Unity');
  for(const a of scene.assets){const dest=path.join(project,a.destination);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(path.join(root,a.source),dest);}
  const dest=path.join(project,'Assets/CampMind/Content/scene-blueprint.json');mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify(scene));
  console.log(JSON.stringify({assets:scene.assets.length,placements:scene.placements.length,characters:scene.characters.length,output:dest}));
}
