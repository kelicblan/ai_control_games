import {Box3,BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Object3D,Vector3,type Material} from 'three';
import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
export interface ModelPlacement {x:number;y:number;z:number;scale:number;angle?:number;sx?:number;sy?:number;sz?:number}
export interface ModelTemplate {parts:{geometry:Mesh['geometry'];material:Material|Material[]}[];dispose:()=>void}
/** A separate distant-tree LOD. Buildings always retain their full source mesh. */
export async function simplifyModelSource(source:Group,ratio:number):Promise<Group>{
 await MeshoptSimplifier.ready;const result=source.clone(true),meshes:Mesh[]=[];
 result.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
 await Promise.all(meshes.map(async mesh=>{
  const geometry=mesh.geometry;
  const position=geometry.attributes.position,positions=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++)positions.set([position.getX(i),position.getY(i),position.getZ(i)],i*3);
  const indices=geometry.index?new Uint32Array(geometry.index.array):Uint32Array.from({length:position.count},(_,i)=>i);
  const [simplified]=MeshoptSimplifier.simplifySloppy(indices,positions,3,null,Math.max(3,Math.floor(indices.length*ratio/3)*3),.06);
  mesh.geometry=geometry.clone();mesh.geometry.setIndex(new BufferAttribute(simplified,1));
  mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 }));return result;
}
/** Immutable one-metre-height template, retaining proportions and all topology. */
export function prepareModelTemplate(source:Group,cloneMaterials=false,orientation=0):ModelTemplate {
 source.updateMatrixWorld(true);const turn=new Matrix4().makeRotationY(orientation),box=new Box3().setFromObject(source).applyMatrix4(turn),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
 if(size.y<=0)throw Error('Empty model bounds');
 const parts:ModelTemplate['parts']=[],materials=new Set<Material>();
 source.traverse(object=>{if(!(object instanceof Mesh))return;
  const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);geometry.applyMatrix4(turn);geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/size.y,1/size.y,1/size.y);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const clone=(mat:Material)=>{const m=cloneMaterials?mat.clone():mat;if(cloneMaterials)materials.add(m);return m;};
  parts.push({geometry,material:Array.isArray(object.material)?object.material.map(clone):clone(object.material)});
 });
 return {parts,dispose(){parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());}};
}
/** Shared geometry/PBR textures, one draw per primitive. */
export function instanceModel(template:ModelTemplate,placements:readonly ModelPlacement[],name:string,shadows=true,cellSize=0):Group {
 const group=new Group();group.name=name;const pose=new Object3D();if(!placements.length)return group;
 const cells=new Map<string,ModelPlacement[]>();
 for(const p of placements){const key=cellSize>0?`${Math.floor(p.x/cellSize)},${Math.floor(p.z/cellSize)}`:'all';let cell=cells.get(key);if(!cell){cell=[];cells.set(key,cell);}cell.push(p);}
 // Small shared-geometry batches allow Three's camera and shadow frusta to reject
 // off-screen props. A single world-sized instance sphere draws every instance.
 for(const part of template.parts)for(const cell of cells.values()){const mesh=new InstancedMesh(part.geometry,part.material,cell.length);mesh.name=name;
  cell.forEach((p,i)=>{pose.position.set(p.x,p.y,p.z);pose.rotation.set(0,p.angle??0,0);pose.scale.set(p.scale*(p.sx??1),p.scale*(p.sy??1),p.scale*(p.sz??1));pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);});
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=shadows;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
 }return group;
}
export function templateMaterials(template:ModelTemplate):MeshStandardMaterial[]{
 return [...new Set(template.parts.flatMap(p=>Array.isArray(p.material)?p.material:[p.material]))].filter((m):m is MeshStandardMaterial=>m instanceof MeshStandardMaterial);
}
