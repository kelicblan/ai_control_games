import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Box3,BufferAttribute,BufferGeometry,DoubleSide,Group,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createThatchedHouses} from '../packages/world-three/src/buildings';
import {CAMP_HOUSES} from '../src/games/camp/world/definition';
import {RainSurfaces} from '../src/scene/rainSurfaces';
import {Shapes} from '../src/scene/geometry';
import {createCompanion} from '../src/scene/characters';
import {NPC_IDS} from '../src/games/camp/simulation/types';
import {disposeHouseModels} from '../packages/world-three/src/thatchedModel';

/** Read the real generated mesh without browser-only image decoding. */
function cottage(){
 const bytes=readFileSync(new URL('../public/assets/models/thatched-cottage/model.glb',import.meta.url));
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
 const binary=bytes.subarray(28+length),primitive=json.meshes[0].primitives[0];
 function attribute(index:number,size:number){
  const accessor=json.accessors[index],view=json.bufferViews[accessor.bufferView];
  const start=binary.byteOffset+(view.byteOffset??0)+(accessor.byteOffset??0);
  const ArrayType=accessor.componentType===5126?Float32Array:accessor.componentType===5125?Uint32Array:Uint16Array;
  return new BufferAttribute(new ArrayType(binary.buffer,start,accessor.count*size),size);
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',attribute(primitive.attributes.POSITION,3));
 geometry.setAttribute('uv',attribute(primitive.attributes.TEXCOORD_0,2));geometry.setIndex(attribute(primitive.indices,1));
 const source=new Group();source.add(new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide})));return source;
}

describe('Tripo cottage integration',()=>{
 it('stands at least two tallest companions high and admits a standing companion through the doorway',async()=>{
  const shapes=new Shapes(),actors=NPC_IDS.map(id=>createCompanion(id,shapes).root);
  const tallest=Math.max(...actors.map(actor=>new Box3().setFromObject(actor).getSize(new Vector3()).y));
  const homes=createThatchedHouses(CAMP_HOUSES,async()=>cottage());await homes.ready;
  homes.group.updateMatrixWorld(true);
  for(const house of CAMP_HOUSES){
   const model=homes.group.getObjectByName(`${house.id} Tripo cottage`)!;
   const bounds=new Box3().setFromObject(model);
   expect(bounds.max.y).toBeGreaterThanOrEqual(tallest*2);
   const x=house.center.x-50,z=house.center.y-50;
   const ray=new Raycaster(new Vector3(x,tallest+.5,z+house.half.y+2),new Vector3(0,0,-1));
   const hits=ray.intersectObject(model,true);expect(hits.length).toBeGreaterThan(0);
   expect(hits[0].point.z).toBeLessThan(z);
  }
  homes.dispose();disposeHouseModels(actors);shapes.dispose();
 });
 it('fits both real doorway meshes to the navigation footprint and retains roofs and rain coverage',async()=>{
  const source=cottage(),homes=createThatchedHouses(CAMP_HOUSES,async()=>source);
  const sourceY=(source.children[0] as Mesh).geometry.attributes.position.getY(0);
  await homes.ready;expect(homes.group.userData.modelState).toBe('ready');homes.group.updateMatrixWorld(true);
  const surfaces=new RainSurfaces(homes.roofs,homes.roofs[1].userData.under as Mesh);
  for(const house of CAMP_HOUSES){
   const model=homes.group.getObjectByName(`${house.id} Tripo cottage`)!;
   expect(model.visible).toBe(true);expect(homes.group.getObjectByName(`${house.id} fallback shell`)!.visible).toBe(false);
   homes.setSelectedPosition(house.beds[0]);expect(model.visible).toBe(true);
   const x=house.center.x-50,z=house.center.y-50,ray=new Raycaster();
   // A ray passes through the entry on +Z and reaches the back wall.
   ray.set(new Vector3(x,2,z+house.half.y+2),new Vector3(0,0,-1));
   const doorHits=ray.intersectObject(model,true);expect(doorHits.length).toBeGreaterThan(0);
   expect(doorHits[0].point.z).toBeLessThan(z);
   // Just beside the opening, the same ray hits the front wall instead.
   ray.set(new Vector3(x+house.doorWidth/2+.65,2,z+house.half.y+2),new Vector3(0,0,-1));
   expect(ray.intersectObject(model,true)[0].point.z).toBeGreaterThan(z+house.half.y-1);
   const hit=new Vector3();expect(surfaces.intersect(x,z,0,0,hit)).toBe(true);
   expect(hit.y).toBeGreaterThan(house.wallHeight+2);expect(hit.y).toBeLessThanOrEqual(house.roofHeight+.01);
  }
  expect((source.children[0] as Mesh).geometry.attributes.position.getY(0)).toBe(sourceY);
  const runoff=new Vector3();surfaces.eave(.5,runoff);expect(runoff.y).toBeCloseTo(CAMP_HOUSES[1].wallHeight);
  homes.dispose();homes.dispose();
 });
 it('keeps fallback buildings usable when loading fails',async()=>{
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const homes=createThatchedHouses(CAMP_HOUSES,async()=>{throw new Error('offline');});
  await homes.ready;expect(homes.group.userData.modelState).toBe('error');
  expect(homes.group.getObjectByName('lord-house fallback shell')!.visible).toBe(true);
  homes.setSelectedPosition(CAMP_HOUSES[0].beds[0]);expect(homes.roofs[0].visible).toBe(true);
  homes.dispose();warning.mockRestore();
 });
 it('disposes an asset arriving after the scene has been closed',async()=>{
  const source=cottage(),dispose=vi.spyOn((source.children[0] as Mesh).geometry,'dispose');
  let release!:(source:Group)=>void;
  const pending=new Promise<Group>(resolve=>{release=resolve;});
  const homes=createThatchedHouses(CAMP_HOUSES,()=>pending);homes.dispose();release(source);await homes.ready;
  expect(dispose).toHaveBeenCalledOnce();expect(homes.group.children).toHaveLength(0);
 });
});
