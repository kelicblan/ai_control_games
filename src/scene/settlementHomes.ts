import {Box3,BoxGeometry,BufferGeometry,CanvasTexture,DoubleSide,Group,Matrix4,Mesh,MeshStandardMaterial,PlaneGeometry,SRGBColorSpace,Vector3} from 'three';
import type {HouseDefinition} from '../games/camp/world/definition';
import {sampleCampSurface} from '../games/camp/world/definition';
import {buildingWalls} from '../../packages/world-core/src/buildings';
import {disposeHouseModels} from '../../packages/world-three/src/thatchedModel';
import type {HouseVisuals} from '../../packages/world-three/src/buildings';
import {accelerateStaticMesh} from '../../packages/world-three/src/staticRaycast';
import {hollowGeometry} from '../../packages/world-three/src/hollowGeometry';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type SettlementAsset='manor'|'cottage'|'watchtower'|'gate'|'pine'|'broadleaf'|'bush'|'grass'|'rock'|'mountain'|'palisade'|'terrain'|'training-ground'|'warehouse'|'weaponsmith';

/** Hip/gable hybrid with raised eaves. The crest runs east-west like the reference. */
export function chineseRoof(hx:number,hz:number,eave:number,ridge:number):PlaneGeometry {
 const geometry=new PlaneGeometry(hx*2,hz*2,32,24);geometry.rotateX(-Math.PI/2);
 const p=geometry.getAttribute('position');
 for(let i=0;i<p.count;i++){
  const x=Math.abs(p.getX(i))/hx,z=Math.abs(p.getZ(i))/hz;
  const slope=Math.max(z,Math.max(0,(x-.58)/.42)*.78);
  p.setY(i,eave+(ridge-eave)*Math.pow(1-slope,1.35)+Math.pow(slope,9)*1.45+Math.pow(x*z,6)*1.25);
 }
 p.needsUpdate=true;geometry.computeVertexNormals();return geometry;
}

/** Bake transforms and fit full bounds. Preserve every source triangle: collision
 * footprints must adapt to art rather than destructively cutting generated art. */
export function fitSettlementModel(source:Group,footprint:{id:string;center:{x:number;y:number};half:{x:number;y:number};height:number;base:number;doorWidth?:number;wallHeight?:number;orientation?:number}):Group {
 source.updateMatrixWorld(true);const orientation=new Matrix4().makeRotationY(footprint.orientation??0),bounds=new Box3().setFromObject(source).applyMatrix4(orientation),size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());
 if(Math.min(size.x,size.y,size.z)<=0)throw Error('Generated building has empty bounds');
 const result=new Group();result.name=`${footprint.id} Tripo model`;
 source.traverse(object=>{
  if(!(object instanceof Mesh))return;
  const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);geometry.applyMatrix4(orientation);
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setXYZ(i,(p.getX(i)-center.x)/size.x*(footprint.half.x*2+4),
   (p.getY(i)-bounds.min.y)/size.y*footprint.height,(p.getZ(i)-center.z)/size.z*(footprint.half.y*2+4));
  p.needsUpdate=true;
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new Mesh(geometry,object.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.staticRainSurface=true;accelerateStaticMesh(mesh);result.add(mesh);
 });
 result.position.set(footprint.center.x-50,footprint.base,footprint.center.y-50);return result;
}

export function createSettlementHomes(houses:readonly HouseDefinition[],load?:(kind:SettlementAsset)=>Promise<Group>):HouseVisuals {
 const group=new Group();group.name='山谷据点 · 领主府与民居';
 const roofs:Mesh[]=[],roomRoofs:Mesh[]=[],sources:Group[]=[],models:Group[]=[],ownedGeometries:BufferGeometry[]=[],textures:CanvasTexture[]=[];
 const box=new BoxGeometry(1,1,1);ownedGeometries.push(box);
 const wood=new MeshStandardMaterial({color:'#715039',roughness:.88});
 const plaster=new MeshStandardMaterial({color:'#e0c9a0',roughness:1});
 const stone=new MeshStandardMaterial({color:'#98988a',roughness:.96});
 const tile=new MeshStandardMaterial({color:'#46525a',roughness:.8,side:DoubleSide});
 const brass=new MeshStandardMaterial({color:'#bb914d',roughness:.48,metalness:.4});
 const cloth=new MeshStandardMaterial({color:'#8f392d',roughness:1,side:DoubleSide});
 const materials=[wood,plaster,stone,tile,brass,cloth];
 const homes:Group[]=[],fallbacks:Group[]=[],homeRoofs:Mesh[]=[];
 const interiorViews=houses.map(()=>({value:0}));
 const interiorSkins:Mesh[][]=houses.map(()=>[]);
 const backSkins:Mesh[]=[];
 const insidePlane=(parent:Group,px:number,py:number,pz:number,w:number,h:number,ry:number,rx=0,mat=plaster)=>{
  const geometry=new PlaneGeometry(w,h);ownedGeometries.push(geometry);const mesh=new Mesh(geometry,mat);mesh.position.set(px,py,pz);mesh.rotation.set(rx,ry,0);mesh.receiveShadow=true;parent.add(mesh);return mesh;
 };
 const block=(parent:Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:MeshStandardMaterial)=>{
  const mesh=new Mesh(box,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 };
 houses.forEach((house,i)=>{
  const base=sampleCampSurface(house.center,0).height,home=new Group(),fallback=new Group();
  home.name=house.name;fallback.name=`${house.id} Chinese fallback`;home.add(fallback);group.add(home);homes.push(home);fallbacks.push(fallback);
  const x=house.center.x-50,z=house.center.y-50,hx=house.half.x,hz=house.half.y;
  block(home,x,base-.32,z,hx*2+2,.6,hz*2+2,stone);
  for(const wall of buildingWalls(house))block(fallback,wall.center.x-50,base+house.wallHeight/2,wall.center.y-50,wall.half.x*2,house.wallHeight,wall.half.y*2,plaster);
  for(const side of [-1,1])for(const end of [-1,1])block(fallback,x+side*hx,base+house.wallHeight/2,z+end*hz,.8,house.wallHeight,.8,wood);
  for(const side of [-1,1])block(fallback,x+side*house.doorWidth/2,base+house.wallHeight/2,z+hz,.65,house.wallHeight,.8,wood);
  block(fallback,x,base+house.wallHeight-.4,z+hz,hx*2,.65,.8,wood);
  const geometry=chineseRoof(hx+2,hz+2,house.wallHeight,house.roofHeight);ownedGeometries.push(geometry);
  const roof=new Mesh(geometry,tile);roof.name=`${house.id} tiled roof`;roof.position.set(x,base,z);roof.castShadow=true;roof.receiveShadow=true;fallback.add(roof);roofs.push(roof);homeRoofs.push(roof);
  const runoffGeometry=geometry.clone();ownedGeometries.push(runoffGeometry);
  const runoff=new Mesh(runoffGeometry,tile);runoff.position.copy(roof.position);runoff.visible=false;home.add(runoff);roof.userData.under=runoff;
  block(fallback,x,base+house.roofHeight+.18,z,hx*1.4,.45,.5,brass);
  for(const side of [-1,1])block(fallback,x+side*(hx-1),base+house.wallHeight*.65,z+hz+.5,1.1,3.1,.22,cloth);
  if(i===0){
   const upper=chineseRoof(hx*.65,hz*.66,house.wallHeight+5,house.roofHeight+2);ownedGeometries.push(upper);
   const mesh=new Mesh(upper,tile);mesh.position.set(x,base,z);mesh.castShadow=true;fallback.add(mesh);
  }
  // The interior uses the same complete footprint and perimeter walls as physics.
  const room=new Group();room.name=`${house.id} full-size room`;home.add(room);
  block(room,x,base-.035,z,hx*2-.45,.1,hz*2-.45,wood);
  for(const wall of buildingWalls(house)){
   const vertical=wall.id==='west'||wall.id==='east';
   const skin=insidePlane(room,wall.center.x-50,base+house.wallHeight/2,wall.center.y-50,vertical?hz*2:wall.half.x*2,house.wallHeight,wall.id==='west'?Math.PI/2:wall.id==='east'?-Math.PI/2:wall.id==='back'?0:Math.PI);
   if(wall.id!=='back'){skin.visible=false;interiorSkins[i].push(skin);}
   else {skin.visible=false;backSkins[i]=skin;}
  }
  const ceiling=insidePlane(room,x,base+house.wallHeight,z,hx*2,hz*2,0,Math.PI/2,wood);ceiling.userData.staticRainSurface=true;roomRoofs.push(ceiling);
  // A hidden weather envelope covers the full room. The visible original
  // gatehouse roofs stay intact; no flat patch is drawn over their tiled eaves.
  const hallRoofGeometry=chineseRoof(hx+2,hz+2,house.wallHeight+.4,house.wallHeight+5);ownedGeometries.push(hallRoofGeometry);
  const hallRoof=new Mesh(hallRoofGeometry,tile);hallRoof.name=`${house.id} continuous hall roof`;hallRoof.position.set(x,base,z);hallRoof.visible=false;hallRoof.userData.staticRainSurface=true;accelerateStaticMesh(hallRoof);home.add(hallRoof);roomRoofs.push(hallRoof);
  const doorHeight=house.doorHeight??house.wallHeight*.75;
  const lintelSkin=insidePlane(room,x,base+(doorHeight+house.wallHeight)/2,z+hz,house.doorWidth,house.wallHeight-doorHeight,Math.PI);lintelSkin.visible=false;interiorSkins[i].push(lintelSkin);
  if(i===0){
   const board=block(home,x,base+doorHeight+3,12,11.4,3.2,.6,wood);board.name='lord-house nameplate';board.userData.text='领主府';board.position.z=z+12;
   if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const context=canvas.getContext('2d');
    if(context){context.fillStyle='#2d2116';context.fillRect(0,0,1024,256);context.strokeStyle='#c9a45b';context.lineWidth=6;context.strokeRect(22,22,980,212);context.fillStyle='#ecd18a';context.font='128px "STKaiti","KaiTi",serif';context.textAlign='center';context.textBaseline='middle';for(const [n,char]of [...'领主府'].entries())context.fillText(char,352+n*160,132);
     const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;textures.push(texture);const material=new MeshStandardMaterial({map:texture,roughness:.8,emissive:'#4b381b',emissiveIntensity:.2});materials.push(material);
     const geometry=new PlaneGeometry(11,2.9);ownedGeometries.push(geometry);const face=new Mesh(geometry,material);face.position.set(x,board.position.y,board.position.z+.31);home.add(face);
    }
   }
  }
  for(const bed of house.beds)block(home,bed.x-50,base+.25,bed.y-50,2.4,.5,3.3,wood);
 });
 roofs.push(...roomRoofs);
 // Keep each house cullable while drawing its many timber joints and wall
 // panels in one batch per material. Named signs and rain surfaces stay separate.
 group.traverse(parent=>{
  if(!(parent instanceof Group))return;
  const batches=new Map<MeshStandardMaterial,Mesh[]>();
  for(const child of parent.children){if(!(child instanceof Mesh)||child.geometry!==box||child.name||child.userData.staticRainSurface)continue;
   const mat=child.material as MeshStandardMaterial;let batch=batches.get(mat);if(!batch){batch=[];batches.set(mat,batch);}batch.push(child);}
  for(const [mat,meshes] of batches){if(meshes.length<2)continue;
   const parts=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
   const geometry=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());ownedGeometries.push(geometry);
   const mesh=new Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;accelerateStaticMesh(mesh);
   for(const previous of meshes)parent.remove(previous);parent.add(mesh);
  }
 });
 let disposed=false;group.userData.modelState=load?'loading':'fallback';
 const ready=load?Promise.allSettled((['manor','cottage'] as const).map(async kind=>{
  const source=await load(kind);
  if(disposed){disposeHouseModels([source]);return;}
  sources.push(source);
  houses.forEach((h,i)=>{
   if((i===0?'manor':'cottage')!==kind)return;
   const model=fitSettlementModel(source,{...h,height:h.roofHeight,base:sampleCampSurface(h.center,0).height,orientation:-Math.PI/2});
   const room=new Box3(new Vector3(-h.half.x+.225,.05,-h.half.y+.225),new Vector3(h.half.x-.225,h.wallHeight,h.half.y-.225));
   const doorway=new Box3(new Vector3(-h.doorWidth/2,.05,h.half.y-.3),new Vector3(h.doorWidth/2,h.doorHeight??h.wallHeight*.75,h.half.y+4));
   model.traverse(object=>{if(object instanceof Mesh){
    const previous=object.geometry,oldEave=h.roofHeight*.3;
    const shell=previous.clone(),positions=shell.getAttribute('position');
    for(let n=0;n<positions.count;n++){
     const y=positions.getY(n);
     positions.setY(n,y<=oldEave?y/oldEave*h.wallHeight:h.wallHeight+(y-oldEave)/(h.roofHeight-oldEave)*(h.roofHeight-h.wallHeight));
    }
    shell.computeVertexNormals();shell.computeBoundingBox();shell.computeBoundingSphere();object.geometry=shell;previous.dispose();
    // Ray collision uses a hollow derivative; exterior rendering retains the
    // source facade and roof without flattening or stretching it horizontally.
    const collision=hollowGeometry(shell,[room,doorway,new Box3(new Vector3(-h.doorWidth/2,.05,0),new Vector3(h.doorWidth/2,h.doorHeight??h.wallHeight*.75,h.half.y+4))]);ownedGeometries.push(collision);
    const proxy=new Mesh(collision,object.material);accelerateStaticMesh(proxy);
    object.raycast=(ray,hits)=>{proxy.matrixWorld.copy(object.matrixWorld);const start=hits.length;proxy.raycast(ray,hits);for(let n=start;n<hits.length;n++)hits[n].object=object;};
    const adapt=(original:MeshStandardMaterial)=>{
     const material=original.clone();materials.push(material);
     material.onBeforeCompile=shader=>{
      shader.uniforms.roomView=interiorViews[i];
      shader.vertexShader='varying vec3 roomPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nroomPoint=position;');
      shader.fragmentShader='uniform float roomView;varying vec3 roomPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(abs(roomPoint.x)<${(h.doorWidth/2).toFixed(5)}&&roomPoint.y>.05&&roomPoint.y<${(h.doorHeight??h.wallHeight*.75).toFixed(5)}&&roomPoint.z>0.)discard;
        if(roomView>.5&&abs(roomPoint.x)<${(h.half.x-.225).toFixed(5)}&&abs(roomPoint.z)<${(h.half.y-.225).toFixed(5)}&&roomPoint.y>.05&&roomPoint.y<${h.wallHeight.toFixed(5)})discard;`);
     };material.customProgramCacheKey=()=>`habitable-exterior-${h.id}`;return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(m=>adapt(m as MeshStandardMaterial)):adapt(object.material as MeshStandardMaterial);
   }});
   if(i===0)model.traverse(object=>{
    if(!(object instanceof Mesh))return;
    // Hide only the flat outer ground apron at draw time. All source geometry,
    // building walls and original steps stay intact above the stone plinth.
    const blend=(original:MeshStandardMaterial)=>{
     const material=original.clone();
     const before=original.onBeforeCompile;
     material.onBeforeCompile=(shader,renderer)=>{
      before.call(original,shader,renderer);
      shader.vertexShader='varying vec3 vManorPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvManorPoint=position;');
      shader.fragmentShader='varying vec3 vManorPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
       if(vManorPoint.y<.48&&(abs(vManorPoint.x)>22.5||vManorPoint.z>15.0||vManorPoint.z< -17.5))discard;`);
     };material.customProgramCacheKey=()=> 'manor-stone-plinth-room-v2';return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(m=>blend(m as MeshStandardMaterial)):blend(object.material as MeshStandardMaterial);
   });
   models.push(model);homes[i].add(model);fallbacks[i].visible=false;
   const first=homeRoofs[i];first.userData.loaded=true;
   // Rain queries the rendered model in its actual transform, not its bounding box.
   const meshes=model.children.filter((o):o is Mesh=>o instanceof Mesh);
   const index=roofs.indexOf(first);roofs.splice(index,1,...meshes);
   if(i===1&&meshes[0])meshes[0].userData.under=first.userData.under;
  });
 })).then(results=>{
  if(disposed)return;
  const errors=results.filter(r=>r.status==='rejected');
  group.userData.modelState=errors.length?'error':'ready';
  for(const error of errors)console.warn('Building model unavailable; retaining Chinese fallback.',error.reason);
 }):Promise.resolve();
 return {group,roofs,ready,setSelectedPosition(){},setCameraPosition(point){houses.forEach((h,i)=>{const base=sampleCampSurface(h.center,0).height;interiorViews[i].value=Math.abs(point.x-(h.center.x-50))<h.half.x&&Math.abs(point.z-(h.center.y-50))<h.half.y&&point.y<base+h.wallHeight?1:0;interiorSkins[i].forEach(mesh=>{mesh.visible=interiorViews[i].value===1;});backSkins[i].visible=interiorViews[i].value===1||(point.y<base+(h.doorHeight??h.wallHeight*.75)&&point.z>h.center.y-50+h.half.y);});},dispose(){
  if(disposed)return;disposed=true;disposeHouseModels([...sources,...models]);
  ownedGeometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.clear();
 }};
}
