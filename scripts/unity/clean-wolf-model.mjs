import fs from 'node:fs';
import path from 'node:path';

// Repair the inspected task 3ec7b9a1: a separate small animal occupies X<0;
// the complete wolf, including its teeth and claws, occupies X>0.16.
const source='native/AnimalAssetSources/wolf-rig/model.glb';
const output='native/CampMind.Unity/Assets/CampMind/Content/Animals/Wolf/WolfRig.glb';
const bytes=fs.readFileSync(source),jsonLength=bytes.readUInt32LE(12);
const doc=JSON.parse(bytes.subarray(20,20+jsonLength));
let binary=Buffer.from(bytes.subarray(28+jsonLength,28+jsonLength+bytes.readUInt32LE(20+jsonLength)));
const primitive=doc.meshes[0].primitives[0],position=doc.accessors[primitive.attributes.POSITION];
const sizes={5121:1,5123:2,5125:4,5126:4},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function row(accessorIndex,index){const a=doc.accessors[accessorIndex],v=doc.bufferViews[a.bufferView],width=sizes[a.componentType]*widths[a.type],offset=(v.byteOffset??0)+(a.byteOffset??0)+index*(v.byteStride??width);return binary.subarray(offset,offset+width);}
const points=Array.from({length:position.count},(_,i)=>{const data=row(primitive.attributes.POSITION,i);return [0,1,2].map(j=>data.readFloatLE(j*4));});
const kept=points.map((p,i)=>p[0]>.16?i:-1).filter(i=>i>=0);
if(kept.length<position.count*.5||points.some(p=>p[0]>=0&&p[0]<=.16))throw new Error('Source separation differs from inspected model; manual review required');
const vertexMap=new Map(kept.map((old,index)=>[old,index]));
const indexAccessor=doc.accessors[primitive.indices];
const readIndex=(data,type)=>type===5125?data.readUInt32LE():type===5123?data.readUInt16LE():data.readUInt8();
const indices=Array.from({length:indexAccessor.count},(_,i)=>readIndex(row(primitive.indices,i),indexAccessor.componentType));
const filtered=[];
for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3),count=tri.filter(index=>vertexMap.has(index)).length;if(count!==0&&count!==3)throw new Error('Separation cuts a triangle');if(count===3)filtered.push(...tri.map(index=>vertexMap.get(index)));}
const skin=doc.skins[0],parents=new Map();doc.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>parents.set(child,i)));
const used=new Set();
for(const i of kept){const j=row(primitive.attributes.JOINTS_0,i),w=row(primitive.attributes.WEIGHTS_0,i),jointType=doc.accessors[primitive.attributes.JOINTS_0].componentType;for(let k=0;k<4;k++)if(w.readFloatLE(k*4)>.00001)used.add(readIndex(j.subarray(k*sizes[jointType]),jointType));}
const needed=new Set();for(const index of used){let node=skin.joints[index];while(node!==undefined){needed.add(node);node=parents.get(node);}}
const keptJoints=skin.joints.map((node,i)=>needed.has(node)?i:-1).filter(i=>i>=0),jointMap=new Map(keptJoints.map((old,index)=>[old,index]));
function append(data,oldAccessor,count,extras={}){const padding=(4-binary.length%4)%4;binary=Buffer.concat([binary,Buffer.alloc(padding)]);const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:data.length});binary=Buffer.concat([binary,data]);const index=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:oldAccessor.componentType,type:oldAccessor.type,count,...(oldAccessor.normalized?{normalized:true}:{}),...extras});return index;}
for(const [semantic,index] of Object.entries(primitive.attributes)){
  const a=doc.accessors[index];const data=Buffer.concat(kept.map(i=>Buffer.from(row(index,i))));
  if(semantic==='JOINTS_0')for(let i=0;i<kept.length;i++)for(let k=0;k<4;k++){const offset=(i*4+k)*sizes[a.componentType],old=readIndex(data.subarray(offset),a.componentType),value=jointMap.get(old)??0;if(a.componentType===5123)data.writeUInt16LE(value,offset);else data.writeUInt8(value,offset);}
  const extras=semantic==='POSITION'?{min:[0,1,2].map(axis=>Math.min(...kept.map(i=>points[i][axis]))),max:[0,1,2].map(axis=>Math.max(...kept.map(i=>points[i][axis])))}:{};
  primitive.attributes[semantic]=append(data,a,kept.length,extras);
}
primitive.indices=append(Buffer.from(new Uint32Array(filtered).buffer),{componentType:5125,type:'SCALAR'},filtered.length);
const bind=skin.inverseBindMatrices;skin.inverseBindMatrices=append(Buffer.concat(keptJoints.map(i=>Buffer.from(row(bind,i)))),doc.accessors[bind],keptJoints.length);skin.joints=keptJoints.map(i=>skin.joints[i]);
doc.asset.extras={...doc.asset.extras,cleanup:'Removed inspected, spatially separate secondary animal; preserved complete primary wolf and pruned unused skin joints'};
doc.buffers=[{byteLength:binary.length}];let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jh,json,bh,binary]));
console.log(JSON.stringify({output,sourceTriangles:indices.length/3,triangles:filtered.length/3,vertices:kept.length,bones:skin.joints.length,removedVertices:position.count-kept.length,additionalCredits:0},null,2));
