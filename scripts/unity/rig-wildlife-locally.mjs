import fs from 'node:fs';
import path from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three';

// Asset repair only: no world state, navigation, hit detection or damage authority.
const species=process.argv[2]??'Boar';
if(!['Boar','Pheasant','Rabbit','Wolf'].includes(species))throw new Error('Unsupported anatomical profile');
const avian=species==='Pheasant';
const source = `native/AnimalAssetSources/${species.toLowerCase()}-source/model.glb`;
const output = `native/CampMind.Unity/Assets/CampMind/Content/Animals/${species}/${species}Rig.glb`;
const bytes = fs.readFileSync(source);
const jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20,20+jsonLength));
const binaryStart = 20+jsonLength+8;
let binary = Buffer.from(bytes.subarray(binaryStart,binaryStart+bytes.readUInt32LE(binaryStart-8)));
const primitive = doc.meshes[0].primitives[0];
const accessor = doc.accessors[primitive.attributes.POSITION];
const view = doc.bufferViews[accessor.bufferView];
const vertices = Array.from({length:accessor.count},(_,i)=>new Vector3(...Array.from({length:3},(_,j)=>binary.readFloatLE((view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??12)+j*4))));
// This bird source faces -Z; canonical repaired assets face +X like the mammals.
if(avian){
  const normalAccessor=doc.accessors[primitive.attributes.NORMAL],normalView=doc.bufferViews[normalAccessor.bufferView];
  for(let i=0;i<vertices.length;i++){
    const v=vertices[i],x=v.x;v.x=-v.z;v.z=x;
    const offset=(view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??12);v.toArray().forEach((value,j)=>binary.writeFloatLE(value,offset+j*4));
    const normalOffset=(normalView.byteOffset??0)+(normalAccessor.byteOffset??0)+i*(normalView.byteStride??12);
    const nx=binary.readFloatLE(normalOffset),nz=binary.readFloatLE(normalOffset+8);binary.writeFloatLE(-nz,normalOffset);binary.writeFloatLE(nx,normalOffset+8);
  }
  accessor.min=[0,1,2].map(axis=>Math.min(...vertices.map(v=>v.getComponent(axis))));accessor.max=[0,1,2].map(axis=>Math.max(...vertices.map(v=>v.getComponent(axis))));
}
const min=new Vector3(...accessor.min),max=new Vector3(...accessor.max),size=max.clone().sub(min);
const at=(x,y,z)=>new Vector3(min.x+x*size.x,min.y+y*size.y,min.z+z*size.z);
const bones=[];
function bone(name,position,parent=0){const index=bones.length;bones.push({name,position,parent});return index;}
bone('Root',new Vector3(),-1);
bone('Pelvis',at(.28,.62,.5));
bone('Spine',at(.45,.66,.5),1);
bone('Chest',at(.62,.65,.5),2);
bone('Head',at(.77,.64,.5),3);
bone('Jaw',at(.88,.40,.5),4);
bone('Tail',at(.12,.64,.5),1);
const feet=[];
for(const front of (avian?[false]:[false,true]))for(const right of [false,true]){
  const candidates=vertices.filter(v=>v.y<min.y+.20*size.y&&(avian|| (front?v.x>min.x+.48*size.x:v.x<min.x+.48*size.x))&&(right?v.z>min.z+.5*size.z:v.z<min.z+.5*size.z));
  if(candidates.length<5)throw new Error('Cannot locate separated feet; manual rig required');
  const foot=candidates.reduce((sum,v)=>sum.add(v),new Vector3()).multiplyScalar(1/candidates.length);foot.y=min.y+.04*size.y;
  const hip=new Vector3(foot.x,min.y+.55*size.y,foot.z*.8);
  const knee=hip.clone().lerp(foot,.5);knee.x+=(front?-.03:.03)*size.x;
  const parent=front?3:1;
  const prefix=`${avian?'Leg':front?'Front':'Hind'}${right?'Right':'Left'}`;
  const hipIndex=bone(prefix+'Upper',hip,parent),kneeIndex=bone(prefix+'Lower',knee,hipIndex),footIndex=bone(prefix+'Hoof',foot,kneeIndex);
  feet.push({front,right,hipIndex,kneeIndex,footIndex,hip,knee,foot});
}
const wings=[];
if(avian)for(const right of [false,true]){
  const wing=bone(right?'WingRight':'WingLeft',at(.53,.64,right?.70:.30),3);
  bone(right?'WingRightTip':'WingLeftTip',at(.38,.48,right?.98:.02),wing);wings.push({index:wing,right});
}
const start=doc.nodes.length;
doc.nodes[0].skin=0;
for(let i=0;i<bones.length;i++){
  const b=bones[i];const translation=b.position.clone().sub(b.parent<0?new Vector3():bones[b.parent].position).toArray();
  doc.nodes.push({name:b.name,translation,children:[]});
}
for(let i=0;i<bones.length;i++)if(bones[i].parent>=0)doc.nodes[start+bones[i].parent].children.push(start+i);
doc.scenes[0].nodes.push(start);
function append(values,componentType,type,count,extra={}){
  const padding=(4-binary.length%4)%4;if(padding)binary=Buffer.concat([binary,Buffer.alloc(padding)]);
  const buffer=Buffer.from(values.buffer,values.byteOffset,values.byteLength);
  const index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:buffer.length});binary=Buffer.concat([binary,buffer]);
  const a=doc.accessors.length;doc.accessors.push({bufferView:index,componentType,type,count,...extra});return a;
}
const joints=new Uint16Array(vertices.length*4),weights=new Float32Array(vertices.length*4);
function segmentDistance(point,a,b){const delta=b.clone().sub(a);const t=Math.max(0,Math.min(1,point.clone().sub(a).dot(delta)/delta.lengthSq()));return point.distanceTo(a.clone().addScaledVector(delta,t));}
for(let i=0;i<vertices.length;i++){
  const v=vertices[i],normalized=v.clone().sub(min).divide(size);let candidates=[];
  if(avian&&normalized.y>.35&&normalized.y<.78&&normalized.x<.74&&Math.abs(normalized.z-.5)>.23){
    const wing=wings[normalized.z>.5?1:0];candidates=[[wing.index,.85],[3,.15]];
  }else if(normalized.y<(avian?.39:.53)&&normalized.x<.76){
    const leg=feet.reduce((best,f)=>{const d=Math.min(segmentDistance(v,f.hip,f.knee),segmentDistance(v,f.knee,f.foot));return !best||d<best.d?{f,d}:best;},null).f;
    const t=Math.max(0,Math.min(1,(leg.hip.y-v.y)/(leg.hip.y-leg.foot.y)));
    const torso=leg.front?3:1;const blend=Math.max(0,Math.min(1,(normalized.y-.38)/.15));
    candidates=[[leg.hipIndex,(1-t)*(1-blend)],[leg.kneeIndex,t*(1-blend)],[torso,blend]];
    if(t>.72)candidates=[[leg.kneeIndex,(1-(t-.72)/.28)*(1-blend)],[leg.footIndex,(t-.72)/.28*(1-blend)],[torso,blend]];
  }else if(normalized.x>.72){const head=Math.min(1,(normalized.x-.72)/.12);candidates=[[3,1-head],[4,head]];if(normalized.x>.86&&normalized.y<.45)candidates=[[5,.7],[4,.3]];}
  else if(normalized.x<.16)candidates=[[6,.8],[1,.2]];
  else {const chest=Math.max(0,Math.min(1,(normalized.x-.3)/.35));candidates=[[1,1-chest],[3,chest]];}
  const total=candidates.reduce((s,c)=>s+c[1],0);for(let j=0;j<candidates.length;j++){joints[i*4+j]=candidates[j][0];weights[i*4+j]=candidates[j][1]/total;}
}
primitive.attributes.JOINTS_0=append(joints,5123,'VEC4',vertices.length);
primitive.attributes.WEIGHTS_0=append(weights,5126,'VEC4',vertices.length);
const binds=new Float32Array(bones.length*16);bones.forEach((b,i)=>new Matrix4().makeTranslation(-b.position.x,-b.position.y,-b.position.z).toArray(binds,i*16));
doc.skins=[{name:`Local repaired ${species} rig`,joints:bones.map((_,i)=>start+i),skeleton:start,inverseBindMatrices:append(binds,5126,'MAT4',bones.length)}];
doc.animations=[];
for(const name of ['Idle','Walk','Run','Attack','Hurt','Death',...(avian?['Flap']:[])]){
  const duration=name==='Run'?.6:name==='Walk'?1:name==='Idle'?2:1;
  const steps=32,times=new Float32Array(steps+1);for(let i=0;i<=steps;i++)times[i]=i/steps*duration;
  const input=append(times,5126,'SCALAR',times.length,{min:[0],max:[duration]});
  const animation={name,channels:[],samplers:[]};
  for(let b=0;b<bones.length;b++){
    const values=new Float32Array((steps+1)*4);
    for(let i=0;i<=steps;i++){
      const t=i/steps,p=t*Math.PI*2;let angle=0,axis=new Vector3(0,0,1);
      if(name==='Walk'||name==='Run')for(const f of feet){const phase=p+((f.front!==f.right)?Math.PI:0);const a=name==='Run'?.40:.22;if(b===f.hipIndex)angle=Math.sin(phase)*a;if(b===f.kneeIndex)angle=Math.max(0,-Math.sin(phase))*a*1.3;if(b===f.footIndex)angle=-Math.sin(phase)*a*.4;}
      if(name==='Idle'&&b===4)angle=Math.sin(p)*.025;
      if(name==='Attack'&&(b===3||b===4))angle=-Math.sin(Math.PI*t)*(b===4?.3:.16);
      if(name==='Hurt'&&b===3)angle=Math.sin(Math.PI*t)*.18;
      if(name==='Death'&&b===0){axis=new Vector3(1,0,0);angle=Math.min(1,t*1.5)*Math.PI/2;}
      if(name==='Flap')for(const wing of wings)if(b===wing.index){axis=new Vector3(1,0,0);angle=Math.sin(p)*(wing.right?1:-1)*.65;}
      new Quaternion().setFromAxisAngle(axis,angle).toArray(values,i*4);
    }
    const sampler=animation.samplers.length;animation.samplers.push({input,output:append(values,5126,'VEC4',steps+1),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:start+b,path:'rotation'}});
  }
  doc.animations.push(animation);
}
doc.asset.extras={...doc.asset.extras,rigSource:'local anatomical repair after Tripo rig-check rejection',animationQuality:'procedural prototype; visual acceptance required'};
doc.buffers=[{byteLength:binary.length}];
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);jsonHeader.writeUInt32LE(json.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jsonHeader,json,binHeader,binary]));
console.log(JSON.stringify({output,bones:bones.length,vertices:vertices.length,clips:doc.animations.map(a=>a.name),feet:feet.map(f=>({front:f.front,right:f.right,position:f.foot.toArray()})),additionalTripoCredits:0},null,2));
