import {Box3,BoxGeometry,CanvasTexture,DoubleSide,Group,Mesh,MeshStandardMaterial,PlaneGeometry,SRGBColorSpace,Vector3,type BufferGeometry} from 'three';
import {FACILITY_COLLISION_PROFILES,FACILITY_WALLS,VILLAGE_FACILITIES} from '../games/camp/world/villageLayout';
import {sampleCampSurface} from '../games/camp/world/definition';
import {disposeHouseModels} from '../../packages/world-three/src/thatchedModel';
import {hollowGeometry} from '../../packages/world-three/src/hollowGeometry';
import {accelerateStaticMesh} from '../../packages/world-three/src/staticRaycast';
import {chineseRoof,fitSettlementModel,type SettlementAsset} from './settlementHomes';

/** Original public assets stay intact; room and door clipping is a view adapter.
 * Simulation walls come exclusively from the shared village layout. */
export function createSettlementFacilities(load?:(kind:SettlementAsset)=>Promise<Group>,seed=0){
 const group=new Group();group.name='村寨 · 练武场与公共建筑';
 const roofs:Mesh[]=[],sources:Group[]=[],models:Group[]=[],geometries:BufferGeometry[]=[],textures:CanvasTexture[]=[];
 const wood=new MeshStandardMaterial({color:'#644a34',roughness:1}),plaster=new MeshStandardMaterial({color:'#d0c0a1',roughness:1,side:DoubleSide});
 const tiles=new MeshStandardMaterial({color:'#4b5356',roughness:.9,side:DoubleSide}),materials=[wood,plaster,tiles];
 const box=new BoxGeometry();geometries.push(box);
 const views=VILLAGE_FACILITIES.map(()=>({value:0})),fallbacks:Group[]=[],fallbackRoofs:Mesh[][]=[];
 const block=(parent:Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,material:MeshStandardMaterial)=>{
  const mesh=new Mesh(box,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 };
 for(const facility of VILLAGE_FACILITIES){
  const fallback=new Group();fallback.name=`${facility.id} fallback`;fallbacks.push(fallback);group.add(fallback);
  const x=facility.center.x-50,z=facility.center.y-50,base=sampleCampSurface(facility.center,seed).height,localRoofs:Mesh[]=[];fallbackRoofs.push(localRoofs);
  if(facility.id==='training-ground'){
   // Keep the central square and its south entrance completely open.
   for(const side of [-1,1])for(const offset of [-.65,0,.65]){
    block(fallback,x+side*(facility.half.x-4),base+2,z+offset*facility.half.y,.7,4,.7,wood);
   }
   continue;
  }
  for(const wall of FACILITY_WALLS.filter(wall=>wall.facilityId===facility.id))block(fallback,wall.center.x-50,base+facility.wallHeight/2,wall.center.y-50,wall.half.x*2,facility.wallHeight,wall.half.y*2,plaster);
  const geometry=chineseRoof(facility.half.x+2,facility.half.y+2,facility.wallHeight,facility.height);geometries.push(geometry);
  const roof=new Mesh(geometry,tiles);roof.position.set(x,base,z);roof.castShadow=true;roof.receiveShadow=true;roof.userData.staticRainSurface=true;roof.userData.facilityRoof=true;accelerateStaticMesh(roof);fallback.add(roof);roofs.push(roof);localRoofs.push(roof);
  // A 10cm step separates the room floor from terrain without sealing its door.
  block(group,x,base+.04,z,facility.half.x*2-.5,.12,facility.half.y*2-.5,wood);
  const board=block(group,x,base+facility.wallHeight-.8,z+facility.half.y+2.05,9,2.1,.25,wood);board.name=`${facility.id} nameplate`;board.userData.text=facility.name;
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const context=canvas.getContext('2d');
   if(context){context.fillStyle='#3a2b21';context.fillRect(0,0,512,128);context.fillStyle='#dcc38a';context.font='76px "STKaiti","KaiTi",serif';context.textAlign='center';context.textBaseline='middle';context.fillText(facility.name,256,68);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;textures.push(texture);const material=new MeshStandardMaterial({map:texture,roughness:1});materials.push(material);
    const faceGeometry=new PlaneGeometry(8.7,1.95);geometries.push(faceGeometry);const face=new Mesh(faceGeometry,material);face.position.copy(board.position);face.position.z+=.13;group.add(face);
   }
  }
 }
 let disposed=false;group.userData.modelState=load?'loading':'fallback';group.userData.modelErrors={};
 const ready=load?Promise.allSettled(VILLAGE_FACILITIES.map(async(facility,index)=>{
  try{
   const source=await load(facility.id);if(disposed){disposeHouseModels([source]);return;}sources.push(source);
   const base=sampleCampSurface(facility.center,seed).height;
   // Geometry inspection: the warehouse opens along native +Z; the smith and
   // training gate open along +X. Every shared physics threshold faces south.
   const model=fitSettlementModel(source,{...facility,base,orientation:facility.id==='warehouse'?0:-Math.PI/2});models.push(model);
   // The generated foundation/slab is uneven (.68–1.44m over its base).
   // Compress its low band into a thin raised slab and translate everything
   // above it continuously. The original GLB and every source triangle remain
   // intact, while the court clears flat terrain without burying actors.
   if(facility.id==='training-ground')model.traverse(object=>{
    if(!(object instanceof Mesh))return;const positions=object.geometry.getAttribute('position');
    for(let vertex=0;vertex<positions.count;vertex++){
     const y=positions.getY(vertex);positions.setY(vertex,y<=1.5?y*.1:y-1.35);
    }
    positions.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingBox();object.geometry.computeBoundingSphere();object.geometry.boundsTree?.refit();accelerateStaticMesh(object);
   });
   if(facility.id!=='training-ground'){
    const doorHeight=facility.wallHeight*.82;
    const profile=FACILITY_COLLISION_PROFILES[facility.id],insetX=profile.sideThickness/2+.005,insetZ=profile.endThickness/2+.005;
    const room=new Box3(new Vector3(profile.offset.x-profile.half.x+insetX,.05,profile.offset.y-profile.half.y+insetZ),new Vector3(profile.offset.x+profile.half.x-insetX,facility.wallHeight,profile.offset.y+profile.half.y-insetZ));
    // The entrance lane extends beyond the full art apron as well as the
    // actual wall; exterior steps/overhangs must not reseal its ray passage.
    const door=new Box3(new Vector3(-facility.doorWidth/2,.05,profile.offset.y),new Vector3(facility.doorWidth/2,doorHeight,Math.max(profile.offset.y+profile.half.y,facility.half.y)+4));
    model.traverse(object=>{if(!(object instanceof Mesh))return;
     const collision=hollowGeometry(object.geometry,[room,door]);geometries.push(collision);const proxy=new Mesh(collision,object.material);accelerateStaticMesh(proxy);
     object.raycast=(ray,hits)=>{proxy.matrixWorld.copy(object.matrixWorld);const start=hits.length;proxy.raycast(ray,hits);for(let n=start;n<hits.length;n++)hits[n].object=object;};
     const adapt=(original:MeshStandardMaterial)=>{
      const material=original.clone();materials.push(material);material.onBeforeCompile=shader=>{
       shader.uniforms.facilityRoomView=views[index];
       shader.vertexShader='varying vec3 facilityPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfacilityPoint=position;');
       shader.fragmentShader='uniform float facilityRoomView;varying vec3 facilityPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(abs(facilityPoint.x)<${(facility.doorWidth/2).toFixed(5)}&&facilityPoint.y>.05&&facilityPoint.y<${doorHeight.toFixed(5)}&&facilityPoint.z>${profile.offset.y.toFixed(5)})discard;
        if(facilityRoomView>.5&&abs(facilityPoint.x-(${profile.offset.x.toFixed(5)}))<${(profile.half.x-insetX).toFixed(5)}&&abs(facilityPoint.z-(${profile.offset.y.toFixed(5)}))<${(profile.half.y-insetZ).toFixed(5)}&&facilityPoint.y>.05&&facilityPoint.y<${facility.wallHeight.toFixed(5)})discard;`);
      };material.customProgramCacheKey=()=>`facility-room-${facility.id}`;return material;
     };
     object.material=Array.isArray(object.material)?object.material.map(material=>adapt(material as MeshStandardMaterial)):adapt(object.material as MeshStandardMaterial);
    });
    // Remove fallback rain surfaces only after the actual model is attached.
    for(const roof of fallbackRoofs[index]){const position=roofs.indexOf(roof);if(position>=0)roofs.splice(position,1);}
    model.traverse(object=>{if(object instanceof Mesh){object.userData.facilityRoof=true;roofs.push(object);}});
   }
   group.add(model);fallbacks[index].visible=false;
  }catch(error){if(!disposed)group.userData.modelErrors[facility.id]=String(error);throw error;}
 })).then(results=>{
  if(disposed)return;group.userData.modelState=results.some(result=>result.status==='rejected')?'error':'ready';
  for(const result of results)if(result.status==='rejected')console.warn('Village facility unavailable; retaining fallback.',result.reason);
 }):Promise.resolve();
 return {group,roofs,ready,setCameraPosition(point:{x:number;y:number;z:number}){VILLAGE_FACILITIES.forEach((facility,index)=>{
  const base=sampleCampSurface(facility.center,seed).height,profile=FACILITY_COLLISION_PROFILES[facility.id];views[index].value=Math.abs(point.x-(facility.center.x+profile.offset.x-50))<profile.half.x-profile.sideThickness/2&&Math.abs(point.z-(facility.center.y+profile.offset.y-50))<profile.half.y-profile.endThickness/2&&point.y<base+facility.wallHeight?1:0;
 });},dispose(){if(disposed)return;disposed=true;disposeHouseModels([...sources,...models]);geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());group.clear();}};
}
