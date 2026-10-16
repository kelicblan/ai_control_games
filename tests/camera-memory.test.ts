import {describe,it,expect} from 'vitest';
import {OrthographicCamera,Vector3} from 'three';
import {defaultOrbit,configureCamera,projectWorld} from '../packages/world-three/src/camera';
import {readCameraOrbit,writeCameraOrbit} from '../src/scene/cameraMemory';
describe('remembered map camera',()=>{
 const storage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
 it('centres the village in the viewport when no view has been saved',()=>{
  const orbit=readCameraOrbit(17,storage()),camera=new OrthographicCamera();configureCamera(camera,1920,920,orbit);
  const point=projectWorld(camera,new Vector3(0,1.5,5),1920,920);
  expect(point.x).toBeCloseTo(960);expect(point.y).toBeCloseTo(460);
 });
 it('restores the last world centre, zoom and orbit without sharing another world view',()=>{
  const memory=storage(),orbit=defaultOrbit();orbit.focus.set(730,42,-420);orbit.zoom=.45;orbit.azimuth=.8;orbit.elevation=.9;
  writeCameraOrbit(17,orbit,memory);const saved=readCameraOrbit(17,memory);
  expect(saved.focus.x).toBe(730);expect(saved.focus.z).toBe(-420);expect(saved.zoom).toBe(.45);expect(saved.azimuth).toBe(.8);expect(saved.elevation).toBe(.9);
  expect(readCameraOrbit(18,memory).focus).toEqual(defaultOrbit().focus);
 });
 it('falls back safely for corrupt data, unsupported versions and denied storage',()=>{
  for(const value of ['broken','null','{}',JSON.stringify({version:2,x:50,y:55,zoom:.16,azimuth:0,elevation:.6}),JSON.stringify({version:1,x:50,y:55,zoom:999,azimuth:0,elevation:.6})]){
   expect(readCameraOrbit(17,{getItem:()=>value,setItem(){}})).toEqual(defaultOrbit());
  }
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  expect(readCameraOrbit(17,denied)).toEqual(defaultOrbit());expect(()=>writeCameraOrbit(17,defaultOrbit(),denied)).not.toThrow();
 });
});
