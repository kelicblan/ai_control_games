import {expect,it} from 'vitest';
import {NativeMapProjection} from '../scripts/world/native-map';
import {createGame} from '../src/games/camp/simulation/engine';
it('renders the source explored terrain without revealing or mutating the world',()=>{
  const state=createGame({seed:17}),before=JSON.stringify(state),map=new NativeMapProjection();
  const result=map.project(state,{center:{x:50,y:55},span:4096});
  const pixels=Buffer.from(result.rgba,'base64');
  expect(pixels.length).toBe(130*130*4);expect([...pixels.subarray(0,4)]).toEqual([4,7,9,255]);
  expect(JSON.stringify(state)).toBe(before);expect(map.project(state,{center:{x:50,y:55},span:4096}).cached).toBe(true);
  expect(()=>map.project(state,{center:{x:NaN,y:0},span:1})).toThrow();
});
