import {describe,it,expect} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
import {ExplorationMap} from '../packages/world-core/src';
import {createWorldTerrain} from '../packages/world-three/src/terrain';
describe('streamed forest detail',()=>{
 it('refreshes a retained tile when camera movement brings its model trees close',()=>{
  const source=new Group();source.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
  const terrain=createWorldTerrain({exploration:new ExplorationMap({seed:1,generatorVersion:1,center:{x:0,y:0},initialRadius:1000}),
   sample:()=>({height:0,water:false,waterLevel:0,forest:1,road:0,biome:'forest'}),riverX:()=>-9999,riverWidth:()=>1,
   treeAt:(x,y)=>x===13&&y===0?{point:{x:270,y:10},size:10}:null,treeModel:source,treeLodModel:source});
  terrain.setView({x:0,y:0},200,{x:0,y:0});
  const tile=terrain.group.children.find(c=>c.position.x===206&&c.position.z===-50)!;
  expect(tile.getObjectByName('Instanced Tripo alpine forest')?.userData.forestDetail).toBe('lod');
  terrain.setView({x:128,y:0},200,{x:0,y:0});
  expect(terrain.group.children.includes(tile)).toBe(true);
  expect(tile.getObjectByName('Instanced Tripo alpine forest')?.userData.forestDetail).toBe('full');terrain.dispose();
 });
});
