import {Box3,BufferGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Vector3,type Texture} from 'three';
import {Shapes,StaticBatch,seeded} from './geometry';
import {CAMP_HOUSES,riverCenter,riverHalfWidth,sampleCampSurface} from '../games/camp/world/definition';
import {PLANTED_TREES,SETTLEMENT_GATE,SETTLEMENT_WALL_SEGMENTS,WATCHTOWER,settlementRoad} from '../games/camp/world/settlement';
import {createSettlementGate} from './settlementGate';
import {createManorApproach} from './manorApproach';
import {createMeadow} from './meadow';
import {fitSettlementModel,type SettlementAsset} from './settlementHomes';
import {disposeHouseModels} from '../../packages/world-three/src/thatchedModel';
import {instanceModel,prepareModelTemplate,simplifyModelSource,type ModelPlacement,type ModelTemplate} from '../../packages/world-three/src/modelInstances';
import {createModelWind} from '../../packages/world-three/src/modelWind';
import {villageClearance} from '../games/camp/world/villageLayout';

/** Intact model assets and deliberate planting; no primitive plant placeholders. */
export function createSettlementScenery(shapes:Shapes,load?:(kind:SettlementAsset)=>Promise<Group>,seed=0){
 const group=new Group();group.name='山谷据点 · 主路与园林';
 const wind=createModelWind();
 const meadow=createMeadow(seed);group.add(meadow.mesh);
 const gate=createSettlementGate(sampleCampSurface(SETTLEMENT_GATE,seed).height);group.add(gate.group);
 const manorApproach=createManorApproach(shapes,seed);group.add(manorApproach.group);
 const architectural=new StaticBatch(),random=seeded(291014);
 const wood=new MeshStandardMaterial({color:'#795737',roughness:1}),stone=new MeshStandardMaterial({color:'#92968b',roughness:.96});
 const geometries:BufferGeometry[]=[],sources:Group[]=[],models:Group[]=[],templates:ModelTemplate[]=[];
 let forestSource:Group|undefined,forestLodSource:Group|undefined,rockTexture:Texture|undefined,disposed=false;
 for(const house of CAMP_HOUSES.slice(1)){
  const x=house.center.x-50,z=house.center.y-50;
  for(const side of [-1,1]){
   for(let k=0;k<8;k++)architectural.add(shapes.cylinder,wood,[x+side*18,1.2,z-12+k*4],[.21,2.4,.21]);
   for(const h of [.7,1.7])architectural.add(shapes.box,wood,[x+side*18,h,z+2],[.21,.23,28]);
   for(const h of [.7,1.7])architectural.add(shapes.box,wood,[x+side*12,h,z+19],[12,.23,.21]);
   for(let k=0;k<4;k++)architectural.add(shapes.cylinder,wood,[x+side*(7+k*4),1.2,z+19],[.21,2.4,.21]);
  }
 }
 const structure=architectural.finish('石阶与民居院落围栏');group.add(structure);
 const planted=(kind:'pine'|'broadleaf'):ModelPlacement[]=>PLANTED_TREES.filter(t=>t.kind===kind&&!villageClearance(t.point.x,t.point.y,8)).map((t,i)=>({x:t.point.x-50,y:sampleCampSurface(t.point,seed).height,z:t.point.y-50,scale:t.size,angle:i*1.71}));
 const shrubs:ModelPlacement[]=[],grass:ModelPlacement[]=[],rocks:ModelPlacement[]=[];
 const blocked=(x:number,y:number,margin=0)=>villageClearance(x,y,margin)||CAMP_HOUSES.some(h=>Math.abs(x-h.center.x)<h.half.x+margin&&Math.abs(y-h.center.y)<h.half.y+margin)
  ||Math.abs(x-SETTLEMENT_GATE.x)<20&&y>165||Math.hypot(x-WATCHTOWER.center.x,y-WATCHTOWER.center.y)<12;
 for(let i=0;i<240;i++){
  const a=random()*Math.PI*2,r=120+random()*19,x=50+Math.cos(a)*r,y=55+Math.sin(a)*r;
  const s=sampleCampSurface({x,y},seed);
  if(blocked(x,y,8)||settlementRoad(x,y)>0||s.water||s.road>.06)continue;
  shrubs.push({x:x-50,y:s.height,z:y-50,scale:1.3+random()*1.4,angle:random()*6.28});
 }
 for(const h of CAMP_HOUSES.slice(1))for(const side of [-1,1])for(let i=0;i<3;i++){
  const x=h.center.x+side*(h.half.x+6),y=h.center.y-8+i*5;
  if(villageClearance(x,y,3))continue;
  shrubs.push({x:x-50,y:sampleCampSurface({x,y},seed).height,z:y-50,scale:1.7+random()*.7,angle:random()*6.28});
 }
 for(let i=0;i<650;i++){
  const x=-180+random()*460,y=-125+random()*460,s=sampleCampSurface({x,y},seed);
  if(blocked(x,y,8)||s.water||s.road>.06||settlementRoad(x,y)>0||Math.abs(Math.hypot(x-50,y-55)-150)<5)continue;
  grass.push({x:x-50,y:s.height,z:y-50,scale:.7+random()*.75,angle:random()*6.28});
 }
 for(let i=0;i<75;i++){
  const y=-230+random()*630,side=random()<.5?-1:1;
  const x=riverCenter(y)+side*(riverHalfWidth(y)+1+random()*6),s=sampleCampSurface({x,y},seed);if(villageClearance(x,y,3)||settlementRoad(x,y)>0||s.water)continue;
  rocks.push({x:x-50,y:s.height-.15,z:y-50,scale:.6+random()*2,angle:random()*6.28});
 }
 const draw=(source:Group,placements:ModelPlacement[],name:string,shadow=true,orientation=0,animated=false)=>{const template=prepareModelTemplate(source,animated,orientation);templates.push(template);const instances=instanceModel(template,placements,name,shadow,48);if(animated)wind.apply(instances);group.add(instances);};
 const fitSingle=(source:Group,id:string,point:{x:number;y:number},width:number,depth:number,height:number)=>{
  const model=fitSettlementModel(source,{id,center:point,half:{x:(width-4)/2,y:(depth-4)/2},height,base:sampleCampSurface(point,seed).height,orientation:-Math.PI/2});models.push(model);group.add(model);
 };
 group.userData.modelState=load?'loading':'fallback';
 const kinds:SettlementAsset[]=['gate','watchtower','pine','broadleaf','bush','grass','rock','palisade'];
 const ready=load?Promise.allSettled(kinds.map(async kind=>{
  let source=await load(kind);if(disposed){disposeHouseModels([source]);return;}sources.push(source);
  // Repeated small props use a derived mesh; their paid original stays intact.
  const ratio=kind==='grass'?.18:kind==='rock'?.25:kind==='bush'?.3:kind==='palisade'?.4:1;
  if(ratio<1){source=await simplifyModelSource(source,ratio);if(disposed){source.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});return;}models.push(source);}
  if(kind==='gate')fitSingle(source,'寨门',SETTLEMENT_GATE,31,9,22);
  if(kind==='watchtower')fitSingle(source,'瞭望塔',WATCHTOWER.center,13,13,31);
  if(kind==='pine'){
   forestSource=source;draw(source,planted('pine'),'有设计点位的寨内松树',true,0,true);
   const lod=await simplifyModelSource(source,.15);
   if(disposed){lod.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});return;}
   forestLodSource=lod;models.push(lod);
  }
  if(kind==='broadleaf')draw(source,planted('broadleaf'),'有设计点位的庭院阔叶树',true,0,true);
  if(kind==='bush')draw(source,shrubs,'庭院与围栏边缘的模型灌木',true,0,true);
  if(kind==='grass')draw(source,grass,'模型草丛与野花',false,0,true);
  if(kind==='rock'){
   source.traverse(o=>{if(o instanceof Mesh){const m=Array.isArray(o.material)?o.material[0]:o.material;if(m instanceof MeshStandardMaterial&&m.map)rockTexture=m.map;}});
   draw(source,rocks,'河岸模型山石');
  }
  // Mountains are continuous terrain ridges, never enlarged boulder props.
  if(kind==='palisade'){
   const bounds=new Box3().setFromObject(source).applyMatrix4(new Matrix4().makeRotationY(-Math.PI/2)),size=bounds.getSize(new Vector3()),placements:ModelPlacement[]=[],height=11;
   for(const {start,end} of SETTLEMENT_WALL_SEGMENTS){
    const x=(start.x+end.x)/2,y=(start.y+end.y)/2,length=Math.hypot(end.x-start.x,end.y-start.y)+.55;
    const base=Math.min(sampleCampSurface(start,seed).height,sampleCampSurface(end,seed).height);
    placements.push({x:x-50,y:base-.35,z:y-50,scale:height,sx:length/(size.x/size.y*height),sz:3.1/(size.z/size.y*height),angle:-Math.atan2(end.y-start.y,end.x-start.x)});
   }draw(source,placements,'完整木制寨墙模型',true,-Math.PI/2);
  }
 })).then(results=>{
  if(disposed)return;const errors=results.filter(r=>r.status==='rejected');group.userData.modelState=errors.length?'error':'ready';
  for(const error of errors)console.warn('Settlement scenery model unavailable.',error.reason);
 }):Promise.resolve();
 return {group,ready,update(open:boolean,time:number,reducedMotion:boolean,strength=0,angle=0){gate.update(open,time,reducedMotion);wind.update(time,strength,angle,reducedMotion);},get rockTexture(){return rockTexture;},get forestSource(){return forestSource;},get forestLodSource(){return forestLodSource;},dispose(){
  if(disposed)return;disposed=true;group.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});
  manorApproach.dispose();gate.dispose();wind.dispose();meadow.dispose();templates.forEach(t=>t.dispose());disposeHouseModels([...sources,...models]);
  structure.traverse(o=>{if(o instanceof Mesh)geometries.push(o.geometry);});geometries.forEach(g=>g.dispose());
  wood.dispose();stone.dispose();group.clear();
 }};
}
