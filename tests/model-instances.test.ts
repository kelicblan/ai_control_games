import {describe,it,expect} from 'vitest';
import {Mesh} from 'three';
import {readBuildingGlb} from './helpers/read-building-glb';
import {simplifyModelSource} from '../packages/world-three/src/modelInstances';
import {disposeHouseModels} from '../packages/world-three/src/thatchedModel';
describe('derived forest LOD',()=>{
 it('reduces distant-tree triangles while retaining UVs and leaving the source intact',async()=>{
  const source=readBuildingGlb('pine');const before:Mesh[]=[];source.traverse(o=>{if(o instanceof Mesh)before.push(o);});
  const count=before[0].geometry.index!.count;
  const lod=await simplifyModelSource(source,.2);const meshes:Mesh[]=[];lod.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
  expect(meshes[0].geometry.index!.count).toBeLessThan(count*.5);expect(before[0].geometry.index!.count).toBe(count);
  expect(meshes[0].geometry.attributes.position.count).toBeGreaterThan(0);expect(meshes[0].material).toBe(before[0].material);
  disposeHouseModels([source,lod]);
 });
});
