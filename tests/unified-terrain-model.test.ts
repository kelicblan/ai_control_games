import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Mesh,Raycaster,Vector3} from 'three';
import {readBuildingGlb} from './helpers/read-building-glb';
import {createWorldTerrain} from '../packages/world-three/src/terrain';
import {ExplorationMap} from '../packages/world-core/src';
import {LANDSCAPE_GRID,LANDSCAPE_REVISION,landscapeHeight} from '../src/games/camp/world/landscape';

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
 it('renders the unified asset once without a second ground layer in covered chunks',()=>{
  const source=readBuildingGlb('terrain');let sourceMesh:Mesh|undefined;source.traverse(o=>{if(o instanceof Mesh)sourceMesh=o;});
  const sourceDispose=vi.spyOn(sourceMesh!.geometry,'dispose');
  const terrain=createWorldTerrain({groundModel:{source,min:LANDSCAPE_GRID.min,max:LANDSCAPE_GRID.max},
   exploration:new ExplorationMap({seed:17,generatorVersion:1,center:{x:50,y:55},initialRadius:1000}),
   sample:p=>({height:landscapeHeight(p.x,p.y),water:false,waterLevel:0,forest:0,road:0,biome:'grass'}),
   riverX:()=>-9999,riverWidth:()=>1,treeAt:()=>null,renderTrees:false});
  terrain.setView({x:50,y:55},200,{x:0,y:0});
  expect(terrain.group.getObjectByName('Unified valley terrain GLB')).toBeDefined();
  let rockValues:ArrayLike<number>|undefined;terrain.group.getObjectByName('Unified valley terrain GLB')!.traverse(o=>{if(o instanceof Mesh)rockValues=o.geometry.getAttribute('exposedRock').array;});
  expect(Array.from(rockValues!).some(v=>v>.9)).toBe(true);
  const duplicate:Mesh[]=[];terrain.group.traverse(o=>{if(o instanceof Mesh&&o.name.startsWith('World chunk'))duplicate.push(o);});
  expect(duplicate).toHaveLength(0);terrain.dispose();expect(sourceDispose).not.toHaveBeenCalled();sourceMesh!.geometry.dispose();
 });
});
