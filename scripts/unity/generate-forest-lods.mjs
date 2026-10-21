import fs from 'node:fs';
import path from 'node:path';
import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
await MeshoptSimplifier.ready;
const root=path.resolve(import.meta.dirname,'../..');if(process.cwd()!==root)throw Error('Run from the Unity checkout');
const source=path.join(root,'native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models'),out=path.join(root,'native/ArtSource/forest-expansion/lod');fs.mkdirSync(out,{recursive:true});
const report=[];
for(const [name,file] of [['conifer','conifer.glb'],['broadleaf','stage2/broadleaf.glb']]){
  const input=fs.readFileSync(path.join(source,file)),jsonLength=input.readUInt32LE(12),original=JSON.parse(input.subarray(20,20+jsonLength).toString()),binary=input.subarray(28+jsonLength);
  function read(index){const a=original.accessors[index],v=original.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3}[a.type],bytes={5123:2,5125:4,5126:4}[a.componentType],result=[];if(!size||!bytes||a.sparse)throw Error('Unsupported source accessor');for(let i=0;i<a.count;i++)for(let k=0;k<size;k++){const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*bytes)+k*bytes;result.push(a.componentType===5126?binary.readFloatLE(offset):a.componentType===5125?binary.readUInt32LE(offset):binary.readUInt16LE(offset));}return result;}
  for(const [level,ratio] of [[1,.3],[2,.1]]){
    const json=structuredClone(original),parts=[binary],stats=[];let offset=binary.length;
    for(let mi=0;mi<original.meshes.length;mi++)for(let pi=0;pi<original.meshes[mi].primitives.length;pi++){
      const p=original.meshes[mi].primitives[pi],positions=read(p.attributes.POSITION),indices=read(p.indices),target=Math.max(3,Math.floor(indices.length*ratio/3)*3);
      const [reduced,error]=MeshoptSimplifier.simplify(new Uint32Array(indices),new Float32Array(positions),3,target,level===1?.05:.15,[]);
      if(reduced.length>=indices.length||reduced.length<3)throw Error(`Invalid ${name} LOD reduction`);
      const bytes=Buffer.from(reduced.buffer,reduced.byteOffset,reduced.byteLength),view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34963});parts.push(bytes);offset+=bytes.length;
      const accessor=json.accessors.length;json.accessors.push({bufferView:view,componentType:5125,count:reduced.length,type:'SCALAR'});json.meshes[mi].primitives[pi].indices=accessor;
      stats.push({originalTriangles:indices.length/3,triangles:reduced.length/3,error});
    }
    json.buffers[0].byteLength=offset;json.asset.generator='CampMind MeshoptSimplifier forest LOD';let header=Buffer.from(JSON.stringify(json));header=Buffer.concat([header,Buffer.alloc((4-header.length%4)%4,32)]);const bin=Buffer.concat(parts),model=Buffer.alloc(28+header.length+bin.length);
    model.writeUInt32LE(0x46546c67);model.writeUInt32LE(2,4);model.writeUInt32LE(model.length,8);model.writeUInt32LE(header.length,12);model.writeUInt32LE(0x4e4f534a,16);header.copy(model,20);model.writeUInt32LE(bin.length,20+header.length);model.writeUInt32LE(0x004e4942,24+header.length);bin.copy(model,28+header.length);
    fs.writeFileSync(path.join(out,`${name}-lod${level}.glb`),model);report.push({name,level,ratio,meshes:stats});
  }
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
