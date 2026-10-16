import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

export function geometryFingerprint(positions,indices){
  const p=new Float32Array(positions),i=new Uint32Array(indices);
  return createHash('sha256').update(Buffer.from(p.buffer)).update(Buffer.from(i.buffer)).digest('hex');
}
export async function simplifyNativeMesh(mesh){
  if(!mesh||!Array.isArray(mesh.positions)||mesh.positions.length<9||mesh.positions.length%3||!mesh.positions.every(Number.isFinite))throw new Error('Invalid source positions');
  if(!Array.isArray(mesh.indices)||mesh.indices.length<3||mesh.indices.length%3||!mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3))throw new Error('Invalid source index');
  if(!(mesh.ratio>0&&mesh.ratio<1))throw new Error('Invalid simplification ratio');
  if(geometryFingerprint(mesh.positions,mesh.indices)!==mesh.sourceMeshHash)throw new Error('Source geometry fingerprint mismatch');
  await MeshoptSimplifier.ready;
  const target=Math.max(3,Math.floor(mesh.indices.length*mesh.ratio/3)*3);
  const [indices,error]=MeshoptSimplifier.simplify(new Uint32Array(mesh.indices),new Float32Array(mesh.positions),3,target,.01,['LockBorder']);
  if(indices.length<3||indices.length%3||indices.length>mesh.indices.length)throw new Error('Invalid simplified mesh');
  return {id:mesh.id,sourceMeshHash:mesh.sourceMeshHash,originalTriangles:mesh.indices.length/3,triangles:indices.length/3,ratio:mesh.ratio,error,indices:Array.from(indices)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=JSON.parse(readFileSync(process.argv[2],'utf8'));if(input.version!==1||!Array.isArray(input.meshes)||!input.meshes.length)throw new Error('Invalid Unity geometry export');
  const meshes=[];for(const mesh of input.meshes)meshes.push(await simplifyNativeMesh(mesh));
  const output=path.resolve(process.argv[3]);const allowed=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../native/CampMind.Unity/Assets/CampMind/Content/Lod')+path.sep;
  if(!output.startsWith(allowed))throw new Error('LOD output must stay under the native Content/Lod directory');
  mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({version:1,unityVersion:input.unityVersion,tool:'three MeshoptSimplifier.simplify; LockBorder; 0.01 geometric error limit',meshes}));
  console.log(JSON.stringify({output,meshes:meshes.map(({id,originalTriangles,triangles,error})=>({id,originalTriangles,triangles,error}))}));
}
