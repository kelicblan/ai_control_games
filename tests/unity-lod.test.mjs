import test from 'node:test';
import assert from 'node:assert/strict';
import { geometryFingerprint, simplifyNativeMesh } from '../scripts/unity/simplify-lods.mjs';

test('native LOD simplifies real geometry while retaining valid source vertex references',async()=>{
  const positions=[],indices=[];const side=33;
  for(let z=0;z<side;z++)for(let x=0;x<side;x++)positions.push(x,Math.sin(x*.1)*.1,z);
  for(let z=0;z<side-1;z++)for(let x=0;x<side-1;x++){const a=z*side+x;indices.push(a,a+side,a+1,a+1,a+side,a+side+1);}
  const source={id:'grid/0',positions,indices,ratio:.15,sourceMeshHash:geometryFingerprint(positions,indices)};
  const before=JSON.stringify(source);const lod=await simplifyNativeMesh(source);
  assert.ok(lod.indices.length>0&&lod.indices.length<indices.length*.6);
  assert.equal(lod.indices.length%3,0);assert.ok(lod.indices.every(i=>i>=0&&i<positions.length/3));
  assert.equal(lod.sourceMeshHash,source.sourceMeshHash);assert.equal(JSON.stringify(source),before);
  assert.ok(lod.error<=.010001,'Keep the conservative one-percent geometric error budget');
});
test('stale or malformed LOD source fails before writing a derived mesh',async()=>{
  const source={id:'invalid',positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],ratio:.15,sourceMeshHash:'0'.repeat(64)};
  await assert.rejects(simplifyNativeMesh(source),/fingerprint/i);
  await assert.rejects(simplifyNativeMesh({...source,indices:[0,1,99]}),/index/i);
});
test('disconnected foliage cards retain their open boundaries instead of collapsing away',async()=>{
  const positions=[],indices=[];
  for(let z=0;z<10;z++)for(let x=0;x<10;x++){const a=positions.length/3;positions.push(x,0,z,x+.01,0,z,x,0,z+.01,x+.01,0,z+.01);indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  const lod=await simplifyNativeMesh({id:'foliage-cards',positions,indices,ratio:.5,sourceMeshHash:geometryFingerprint(positions,indices)});
  assert.equal(lod.indices.length,indices.length,'Every vertex borders an authored leaf card; preserve those silhouettes');
});
