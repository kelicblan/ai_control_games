import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateReference,projectReference,unprojectReference} from '../scripts/reference-region/geometry';

const data=JSON.parse(readFileSync('native/ArtSource/reference-initial-region/constraints.json','utf8'));
describe('reference region source and calibration',()=>{
 it('binds measurements to the selected immutable image',()=>{
  const bytes=readFileSync('native/ArtSource/reference-initial-region/layout-reference.png');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(data.source.sha256);
  expect(data.source.width).toBe(2048);expect(data.source.height).toBe(1303);
  expect(bytes.readUInt32BE(16)).toBe(data.source.width);expect(bytes.readUInt32BE(20)).toBe(data.source.height);
  expect(validateReference(data)).toEqual([]);
 });
 it('preserves screen landmarks at different heights and camera bearings',()=>{
  for(const azimuth of [0,28,-63])for(const elevation of [30,35,57]){
   const camera={...data.camera,azimuth,elevation};
   for(const p of [[0,0],[2048,1303],[1043,789],[1282,796]])for(const h of [0,18,95]){
    const world=unprojectReference(p as [number,number],h,camera,data.source);
    const result=projectReference(world,camera,data.source);
    expect(result[0]).toBeCloseTo(p[0],8);expect(result[1]).toBeCloseTo(p[1],8);
   }
  }
 });
 it('rejects invalid or fabricated confidence declarations',()=>{
  const broken=structuredClone(data);broken.features[0].points[0][0]=-5;
  expect(validateReference(broken).some(s=>s.includes('outside image'))).toBe(true);
  const falsePrecision=structuredClone(data);falsePrecision.features[0].uncertaintyPixels=0;
  expect(validateReference(falsePrecision).some(s=>s.includes('uncertainty'))).toBe(true);
 });
 it('keeps unobserved gate out of confirmed placement data',()=>{
  expect(data.unresolved.some((p:{id:string})=>p.id==='gate')).toBe(true);
  expect(data.features.some((p:{id:string})=>p.id==='gate')).toBe(false);
  expect(data.camera.status).toBe('provisional-not-calibrated');
  expect(data.visualAccepted).toBe(false);
 });
 it('rejects roof direction constraints detached from the image',()=>{
  const broken=structuredClone(data);broken.features.find((f:{id:string})=>f.id==='manor-roof').ridge=[[100,100],[3000,100]];
  expect(validateReference(broken).some(s=>s.includes('ridge outside image'))).toBe(true);
 });
});
