import fs from 'node:fs';
import path from 'node:path';
import { Object3D, Vector3, Quaternion } from 'three';

const directory='native/CampMind.Unity/Assets/CampMind/Content/Animals';
const selectedSpecies=process.argv.slice(2);
for(const species of ['Tiger','Bear','Boar','Pheasant','Rabbit','Deer','Wolf'].filter(species=>!selectedSpecies.length||selectedSpecies.includes(species))){
  const folder=path.join(directory,species),rig=path.join(folder,`${species}Rig.glb`);
  if(!fs.existsSync(rig))continue;
  const source=species==='Tiger'?path.join(folder,'TigerWalk.glb'):rig;
  const output=path.join(folder,`${species}Actions.glb`);
  if(species==='Boar'||species==='Pheasant'){fs.copyFileSync(rig,output);continue;}
  const bytes=fs.readFileSync(source),length=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.subarray(20,20+length));
  let binary=Buffer.from(bytes.subarray(28+length,28+length+bytes.readUInt32LE(20+length)));
  const objects=doc.nodes.map(node=>{const o=new Object3D();if(node.translation)o.position.fromArray(node.translation);if(node.rotation)o.quaternion.fromArray(node.rotation);if(node.scale)o.scale.fromArray(node.scale);if(node.matrix){o.matrix.fromArray(node.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}return o;});
  const parents=new Map();doc.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>{objects[i].add(objects[child]);parents.set(child,i);}));objects.forEach(o=>o.updateWorldMatrix(true,false));
  const joints=doc.skins[0].joints,jointSet=new Set(joints);
  const positions=new Map(joints.map(i=>[i,objects[i].getWorldPosition(new Vector3())]));
  const ys=[...positions.values()].map(v=>v.y),low=Math.min(...ys),high=Math.max(...ys);
  const root=joints.find(i=>/Root$/i.test(doc.nodes[i].name))??doc.skins[0].skeleton??joints[0];
  const head=joints.filter(i=>/Head_0$/.test(doc.nodes[i].name))[0];
  const leaves=joints.filter(i=>!(doc.nodes[i].children??[]).some(c=>jointSet.has(c))&&positions.get(i).y<low+(high-low)*.30);
  if(leaves.length<4)throw new Error(`${species}: cannot identify four feet for animation`);
  const footCenter=leaves.reduce((sum,i)=>sum.add(positions.get(i)),new Vector3()).multiplyScalar(1/leaves.length);
  const forward=species==='Wolf'&&head!==undefined?positions.get(head).clone().sub(footCenter).setY(0).normalize():new Vector3(1,0,0);
  const lateral=new Vector3().crossVectors(forward,new Vector3(0,1,0)).normalize();
  const xs=leaves.map(i=>positions.get(i).dot(forward)),zs=leaves.map(i=>positions.get(i).dot(lateral)),midX=(Math.min(...xs)+Math.max(...xs))/2,midZ=(Math.min(...zs)+Math.max(...zs))/2;
  const limbs=[];
  for(const front of [false,true])for(const right of [false,true]){
    const candidates=leaves.filter(i=>(positions.get(i).dot(forward)>midX)===front&&(positions.get(i).dot(lateral)>midZ)===right).sort((a,b)=>positions.get(a).y-positions.get(b).y);
    if(!candidates.length)throw new Error(`${species}: missing anatomical foot quadrant`);
    let current=candidates[0],chain=[];
    while(current!==undefined&&current!==root&&jointSet.has(current)&&chain.length<4){chain.push(current);current=parents.get(current);}
    limbs.push({front,right,chain});
  }
  const append=(array,componentType,type,count,extras={})=>{const padding=(4-binary.length%4)%4;binary=Buffer.concat([binary,Buffer.alloc(padding)]);const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:data.length});binary=Buffer.concat([binary,data]);const index=doc.accessors.length;doc.accessors.push({bufferView:view,componentType,type,count,...extras});return index;};
  doc.animations??=[];
  for(const a of doc.animations)if(a.name==='preset:quadruped:walk')a.name='Walk';
  for(const name of ['Idle','Walk','Run','Attack','Hurt','Death']){
    if(doc.animations.some(a=>a.name===name))continue;
    const duration=name==='Idle'?2:name==='Run'?.65:1,steps=32;
    const times=Float32Array.from({length:steps+1},(_,i)=>i/steps*duration),input=append(times,5126,'SCALAR',times.length,{min:[0],max:[duration]});
    const animation={name,channels:[],samplers:[]};
    const affected=new Set([root,...limbs.flatMap(l=>l.chain),...(head===undefined?[]:[head])]);
    for(const index of affected){
      const base=objects[index].quaternion.clone(),worldRotation=objects[index].getWorldQuaternion(new Quaternion());
      const values=new Float32Array((steps+1)*4);
      for(let i=0;i<=steps;i++){
        const t=i/steps,p=t*Math.PI*2;let angle=0,worldAxis=lateral.clone();
        if(name==='Walk'||name==='Run')for(const limb of limbs){const chainIndex=limb.chain.indexOf(index);if(chainIndex<0)continue;const wave=Math.sin(p+((limb.front!==limb.right)?Math.PI:0)),amplitude=name==='Run'?.28:.16;angle=chainIndex>=2?wave*amplitude:Math.max(0,-wave)*amplitude*.7;}
        if(index===head&&name==='Idle')angle=Math.sin(p)*.018;
        if(index===head&&name==='Attack')angle=-Math.sin(Math.PI*t)*.26;
        if(index===root&&name==='Attack')angle=-Math.sin(Math.PI*t)*.06;
        if(index===root&&name==='Hurt')angle=Math.sin(Math.PI*t)*.10;
        if(index===root&&name==='Death'){worldAxis=forward.clone();angle=Math.min(1,t*1.5)*Math.PI/2;}
        const localAxis=worldAxis.applyQuaternion(worldRotation.clone().invert());base.clone().multiply(new Quaternion().setFromAxisAngle(localAxis,angle)).toArray(values,i*4);
      }
      const sampler=animation.samplers.length;animation.samplers.push({input,output:append(values,5126,'VEC4',steps+1),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:index,path:'rotation'}});
    }
    doc.animations.push(animation);
  }
  doc.asset.extras={...doc.asset.extras,animationQuality:'procedural prototype; species-specific combat and foot-contact refinement pending',authoritativeActions:false};
  doc.buffers=[{byteLength:binary.length}];let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(output,Buffer.concat([header,jh,json,bh,binary]));
  console.log(JSON.stringify({species,output,clips:doc.animations.map(a=>a.name),limbChains:limbs.map(l=>l.chain.map(i=>doc.nodes[i].name)),additionalTripoCredits:0}));
}
