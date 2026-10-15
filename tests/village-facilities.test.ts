import {describe,it,expect,vi} from 'vitest';
import {Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,Raycaster,Vector3,type WebGLProgramParametersWithUniforms,type WebGLRenderer} from 'three';
import {createSettlementFacilities} from '../src/scene/settlementFacilities';
import {VILLAGE_FACILITIES} from '../src/games/camp/world/villageLayout';
import {RainSurfaces} from '../src/scene/rainSurfaces';
import {sampleCampSurface} from '../src/games/camp/world/definition';
import {createMeadow} from '../src/scene/meadow';
import {villageClearance} from '../src/games/camp/world/villageLayout';
import {readBuildingGlb} from './helpers/read-building-glb';

function source(){const group=new Group();group.add(new Mesh(new BoxGeometry(2,2,2),new MeshStandardMaterial()));return group;}
describe('village facility rendering',()=>{
 it('loads every complete public asset at the shared layout footprint',async()=>{
  const originals:Group[]=[];
  const facilities=createSettlementFacilities(async()=>{const model=source();originals.push(model);return model;});
  await facilities.ready;facilities.group.updateMatrixWorld(true);
  expect(facilities.group.userData.modelState).toBe('ready');
  for(const facility of VILLAGE_FACILITIES){
   const model=facilities.group.getObjectByName(`${facility.id} Tripo model`)!;
   expect(model).toBeTruthy();const bounds=new Box3().setFromObject(model),center=bounds.getCenter(new Vector3());
   expect(center.x).toBeCloseTo(facility.center.x-50);expect(center.z).toBeCloseTo(facility.center.y-50);
   expect(bounds.min.y).toBeCloseTo(sampleCampSurface(facility.center,0).height);
   const mesh=model.children[0] as Mesh;
   expect(mesh.geometry.index?.count).toBe(36);expect(mesh.geometry.attributes.position.count).toBe(24);
  }
  facilities.dispose();
 });
 it('separates the real training court slab from terrain across its playable center',async()=>{
  const facilities=createSettlementFacilities(async kind=>kind==='training-ground'?readBuildingGlb(kind):source());await facilities.ready;
  facilities.group.updateMatrixWorld(true);const facility=VILLAGE_FACILITIES.find(f=>f.id==='training-ground')!,base=sampleCampSurface(facility.center,0).height;
  const model=facilities.group.getObjectByName('training-ground Tripo model')!;
  for(let dx=-30;dx<=30;dx+=10)for(let dz=-24;dz<=24;dz+=8){
   const point={x:facility.center.x+dx,y:facility.center.y+dz},ground=sampleCampSurface(point,0).height;
   const ray=new Raycaster(new Vector3(point.x-50,base+20,point.y-50),new Vector3(0,-1,0));
   const hit=ray.intersectObject(model,true)[0];
   expect(hit).toBeDefined();expect(hit.point.y-ground).toBeGreaterThan(.06);expect(hit.point.y-ground).toBeLessThan(.25);
  }
  facilities.dispose();
 });
 it('emits floating GLSL literals for every generated room and doorway threshold',async()=>{
  const facilities=createSettlementFacilities(async()=>source());await facilities.ready;
  for(const facility of VILLAGE_FACILITIES.filter(f=>f.wallHeight>0)){
   const mesh=facilities.group.getObjectByName(`${facility.id} Tripo model`)!.children[0] as Mesh;
   const material=mesh.material as MeshStandardMaterial;
   const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'} as WebGLProgramParametersWithUniforms;
   material.onBeforeCompile(shader,{} as WebGLRenderer);
   const comparisons=[...shader.fragmentShader.matchAll(/[<>]\s*(-?(?:\d+\.?\d*|\.\d+))/g)].map(match=>match[1]);
   expect(comparisons.length).toBeGreaterThan(5);expect(comparisons.every(literal=>literal.includes('.'))).toBe(true);
  }
  facilities.dispose();
 });
 it('opens ray passage through generated entrances without deleting rendered triangles',async()=>{
  const facilities=createSettlementFacilities(async()=>source());await facilities.ready;facilities.group.updateMatrixWorld(true);
  for(const facility of VILLAGE_FACILITIES.filter(f=>f.wallHeight>0)){
   const model=facilities.group.getObjectByName(`${facility.id} Tripo model`)!;
   const ray=new Raycaster(new Vector3(facility.center.x-50,sampleCampSurface(facility.center,0).height+2,facility.center.y-50+facility.half.y+8),new Vector3(0,0,-1));
   const hits=ray.intersectObject(model,true);
   expect(hits.every(hit=>hit.point.z<facility.center.y-50)).toBe(true);
   expect((model.children[0] as Mesh).geometry.index?.count).toBe(36);
  }
  facilities.dispose();
 });
 it('preserves the real smith side wall in ray collision while opening its south doorway',async()=>{
  const facilities=createSettlementFacilities(async kind=>kind==='weaponsmith'?readBuildingGlb(kind):source());await facilities.ready;facilities.group.updateMatrixWorld(true);
  const facility=VILLAGE_FACILITIES.find(f=>f.id==='weaponsmith')!,model=facilities.group.getObjectByName('weaponsmith Tripo model')!;
  const base=sampleCampSurface(facility.center,0).height;
  const sideRay=new Raycaster(new Vector3(facility.center.x-50-20,base+4,facility.center.y-50),new Vector3(1,0,0));
  const sideHits=sideRay.intersectObject(model,true);
  expect(sideHits.some(hit=>Math.abs(hit.point.x-(facility.center.x-50-13.75))<1)).toBe(true);
  const doorRay=new Raycaster(new Vector3(facility.center.x-50,base+4,facility.center.y-50+20),new Vector3(0,0,-1));
  expect(doorRay.intersectObject(model,true).every(hit=>hit.point.z<facility.center.y-50)).toBe(true);
  facilities.dispose();
 });
 it('enables interior view only within the actual shifted building walls',async()=>{
  const facilities=createSettlementFacilities(async()=>source());await facilities.ready;
  const facility=VILLAGE_FACILITIES.find(f=>f.id==='weaponsmith')!,model=facilities.group.getObjectByName('weaponsmith Tripo model')!;
  const material=(model.children[0] as Mesh).material as MeshStandardMaterial;
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'} as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader,{} as WebGLRenderer);
  facilities.setCameraPosition({x:facility.center.x-50+14,y:2,z:facility.center.y-50});
  expect(shader.uniforms.facilityRoomView.value).toBe(0);
  facilities.setCameraPosition({x:facility.center.x-50-2,y:2,z:facility.center.y-50});
  expect(shader.uniforms.facilityRoomView.value).toBe(1);
  facilities.dispose();
 });
 it('keeps modeled grass outside the plaza and every functional footprint',()=>{
  const meadow=createMeadow(42);let intrusions=0,vertices=0;
  meadow.mesh.traverse(object=>{if(!(object instanceof Mesh))return;const positions=object.geometry.attributes.position;vertices+=positions.count;
   for(let i=0;i<positions.count;i++)if(villageClearance(positions.getX(i)+50,positions.getZ(i)+50))intrusions++;
  });
  expect(vertices).toBeGreaterThan(1000);expect(intrusions).toBe(0);meadow.dispose();
 },60000);
 it('includes warehouse and smith roofs in rain queries while leaving training center open',async()=>{
  const facilities=createSettlementFacilities(async()=>source());await facilities.ready;facilities.group.updateMatrixWorld(true);
  const rain=new RainSurfaces(facilities.roofs,facilities.roofs[0]);
  for(const facility of VILLAGE_FACILITIES){const hit=new Vector3();expect(rain.intersect(facility.center.x-50,facility.center.y-50,0,0,hit)).toBe(facility.id!=='training-ground');}
  facilities.dispose();
 });
 it('reports individual load failures and retains the procedural shelter',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const facilities=createSettlementFacilities(async kind=>{if(kind==='warehouse')throw Error('offline');return source();});await facilities.ready;
  expect(facilities.group.userData.modelState).toBe('error');expect(facilities.group.userData.modelErrors.warehouse).toContain('offline');
  expect(facilities.group.getObjectByName('warehouse fallback')?.visible).toBe(true);
  facilities.dispose();warn.mockRestore();
 });
 it('disposes late sources and makes closing the scene idempotent',async()=>{
  const model=source(),geometry=(model.children[0] as Mesh).geometry,disposed=vi.spyOn(geometry,'dispose');
  let resolve!:(value:Group)=>void;const waiting=new Promise<Group>(r=>{resolve=r;});
  const facilities=createSettlementFacilities(()=>waiting);facilities.dispose();facilities.dispose();resolve(model);await facilities.ready;
  expect(disposed).toHaveBeenCalled();expect(facilities.group.children).toHaveLength(0);
 });
});
