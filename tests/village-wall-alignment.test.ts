import {describe,it,expect} from 'vitest';
import {worldCanTraverse} from '../src/games/camp/world/navigation';

describe('generated facility wall landmarks',()=>{
 it.each([
  ['training west',101.45,-25],['training east',189.35,-25],
  ['warehouse west',-37.07,-5],['warehouse east',-4.63,-5],
  ['smith west',-33.75,65],['smith east',-9.94,65],
 ] as const)('blocks movement across the visible %s wall',(_name,x,y)=>{
  expect(worldCanTraverse({x:x-2,y},{x:x+2,y},17)).toBe(false);
 });
 it.each([[-20,-5],[-20,65],[145,-25]])('keeps the actual south-facing door at %s,%s open',(x,y)=>{
  // The warehouse now contains real supply crates: enter the door, stop before the pile.
  expect(worldCanTraverse({x,y:y+(x===145?50:30)},{x,y:y===-5?y+4:y},17)).toBe(true);
 });
});
