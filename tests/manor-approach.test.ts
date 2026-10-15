import {describe,it,expect} from 'vitest';
import {Shapes} from '../src/scene/geometry';
import {createManorApproach} from '../src/scene/manorApproach';
import {sampleCampSurface} from '../src/games/camp/world/definition';
describe('solid manor entrance',()=>{
 it('joins all risers to the forecourt and follows the authoritative ramp',()=>{
  const shapes=new Shapes(),approach=createManorApproach(shapes,17);
  for(let i=0;i<approach.steps.length;i++){
   const step=approach.steps[i];expect(step.top-step.bottom).toBeGreaterThanOrEqual(.45-.00001);
   expect(step.top-sampleCampSurface({x:50,y:step.back},17).height).toBeCloseTo(.17);
   if(i)expect(step.front).toBe(approach.steps[i-1].back);
  }
  expect(approach.steps.at(-1)!.back).toBe(-14);
  expect(approach.steps.at(-1)!.top).toBeCloseTo(approach.terraceTop);
  expect(approach.group.children.length).toBeGreaterThan(0);
  approach.dispose();shapes.dispose();
 });
});
