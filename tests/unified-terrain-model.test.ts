import { readFileSync } from 'node:fs';
import { Mesh,Raycaster,Vector3 } from 'three';
import { describe,expect,it } from 'vitest';
import { LANDSCAPE_GRID,LANDSCAPE_REVISION,landscapeHeight } from '../src/games/camp/world/landscape';
import { readBuildingGlb } from './helpers/read-building-glb';

describe('exported initial terrain model',()=>{
 it('loads a real connected GLB with matching generation metadata and raycast heights',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/models/valley/terrain/manifest.json',import.meta.url),'utf8'));
  expect(manifest.revision).toBe(LANDSCAPE_REVISION);expect(manifest.grid).toEqual(LANDSCAPE_GRID);
  const model=readBuildingGlb('terrain');model.updateMatrixWorld(true);const meshes:Mesh[]=[];model.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
  expect(meshes).toHaveLength(1);expect(meshes[0].geometry.index!.count/3).toBe(manifest.triangles);
  for(const p of [{x:47.3,y:-42.7},{x:-162.3,y:72.7},{x:-405.1,y:-365.4}]){
   const ray=new Raycaster(new Vector3(p.x-50,1500,p.y-50),new Vector3(0,-1,0));
   const hit=ray.intersectObject(model,true)[0];expect(hit).toBeDefined();expect(hit.point.y).toBeCloseTo(landscapeHeight(p.x,p.y),4);
  }meshes.forEach(m=>{m.geometry.dispose();});
 });
});
