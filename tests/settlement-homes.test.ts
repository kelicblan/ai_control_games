import {describe,it,expect,vi} from 'vitest';
import {Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {createSettlementHomes,fitSettlementModel} from '../src/scene/settlementHomes';
import {CAMP_HOUSES,sampleCampSurface} from '../src/games/camp/world/definition';
import {RainSurfaces} from '../src/scene/rainSurfaces';
import {readBuildingGlb} from './helpers/read-building-glb';
import {disposeHouseModels} from '../packages/world-three/src/thatchedModel';

describe('settlement home rendering lifecycle',()=>{
 it('fits real Tripo models into world metres without deleting or changing any source triangles',()=>{
  for(const [index,kind] of [[0,'manor'],[1,'cottage']] as const){
   const h=CAMP_HOUSES[index],base=sampleCampSurface(h.center,0).height,source=readBuildingGlb(kind);
   const model=fitSettlementModel(source,{...h,height:h.roofHeight,base});model.updateMatrixWorld(true);
   const bounds=new Box3().setFromObject(model);expect(bounds.min.y).toBeCloseTo(base,3);expect(bounds.max.y).toBeCloseTo(base+h.roofHeight,3);
   const sourceMeshes:Mesh[]=[],fittedMeshes:Mesh[]=[];source.traverse(o=>{if(o instanceof Mesh)sourceMeshes.push(o);});model.traverse(o=>{if(o instanceof Mesh)fittedMeshes.push(o);});
   expect(fittedMeshes).toHaveLength(sourceMeshes.length);
   sourceMeshes.forEach((mesh,i)=>{
    expect(fittedMeshes[i].geometry.index?.count).toBe(mesh.geometry.index?.count);
    expect(fittedMeshes[i].geometry.attributes.position.count).toBe(mesh.geometry.attributes.position.count);
    expect(Array.from(fittedMeshes[i].geometry.index?.array??[])).toEqual(Array.from(mesh.geometry.index?.array??[]));
   });
   disposeHouseModels([source,model]);
  }
 });
 it('keeps every Chinese roof fallback with rain coverage above a raised manor',()=>{
  const homes=createSettlementHomes(CAMP_HOUSES);
  const rain=new RainSurfaces(homes.roofs,homes.roofs[1].userData.under as Mesh);
  for(const h of CAMP_HOUSES){const hit=new Vector3();
   expect(rain.intersect(h.center.x-50,h.center.y-50,0,0,hit)).toBe(true);
   expect(hit.y).toBeCloseTo(h.roofHeight+sampleCampSurface(h.center,0).height,1);
  }
  expect(homes.group.children).toHaveLength(CAMP_HOUSES.length);homes.dispose();homes.dispose();
 });
 it('retains each fallback if generated model loading fails',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const homes=createSettlementHomes(CAMP_HOUSES,async()=>{throw Error('offline');});await homes.ready;
  expect(homes.group.userData.modelState).toBe('error');
  for(const h of CAMP_HOUSES)expect(homes.group.getObjectByName(`${h.id} Chinese fallback`)?.visible).toBe(true);
  homes.dispose();warn.mockRestore();
 });
 it('disposes models arriving after the scene closes without attaching them',async()=>{
  const source=new Group(),geometry=new BoxGeometry();source.add(new Mesh(geometry,new MeshStandardMaterial()));
  const disposed=vi.spyOn(geometry,'dispose');let release!:(g:Group)=>void;
  const waiting=new Promise<Group>(resolve=>{release=resolve;});
  const homes=createSettlementHomes(CAMP_HOUSES,()=>waiting);homes.dispose();release(source);await homes.ready;
  expect(disposed).toHaveBeenCalled();expect(homes.group.children).toHaveLength(0);
 });
});
