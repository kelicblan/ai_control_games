import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildTerrain,placements,CLEARINGS,PATHS,LIMITS,ORIGIN,FORWARD,SIDE,world,logical,streamV,waterHeight,HABITATS,WATER_STANDS,setRiverBoundary,inTerrain} from './forest-expansion.mjs';

const repo=path.resolve(import.meta.dirname,'../..');
if(path.resolve(process.cwd())!==repo)throw Error('Run from the current Unity checkout');
const out=path.join(repo,'native/ArtSource/forest-expansion');fs.mkdirSync(out,{recursive:true});
const village=JSON.parse(fs.readFileSync(path.join(repo,'native/ArtSource/new-world-runtime.json'),'utf8'));
if(!fs.existsSync(path.join(out,'original-river.json')))throw Error('Export the authored river boundary from Unity before generating the southern forest');
setRiverBoundary(JSON.parse(fs.readFileSync(path.join(out,'original-river.json'),'utf8')));
const terrain=buildTerrain(),decoration=placements();
for(const site of decoration.resources){const prior=village.forestExpansion?.resources.find(s=>s.id===site.id);if(prior)site.stand={...prior.stand};}
for(const kind of ['trees','rocks'])decoration[kind]=decoration[kind].filter(t=>{const p=logical(t.u,t.v);return decoration.resources.every(s=>Math.hypot(p.x-s.stand.x,p.y-s.stand.y)>(kind==='trees'?2.3:4));});
const water={name:'Clear shallow forest stream',positions:[],normals:[],colors:[],uv:[],indices:[]};
for(let u=-235;u<=235;u++)for(let side=0;side<2;side++){
  water.positions.push(...world(u,streamV(u)+(side?2.7:-2.7),waterHeight(u)));water.normals.push(0,1,0);water.colors.push(.39,.76,.91,.25);water.uv.push(u/4,side);
}
for(let i=0;i<470;i++){const a=i*2,u=-235+i;if(inTerrain(u,streamV(u))&&inTerrain(u+1,streamV(u+1)))water.indices.push(a,a+2,a+1,a+1,a+2,a+3);}
// Portable GLB source, including vertex colour and normals; no generator service required.
function glb(meshes){
  const parts=[],views=[],accessors=[];let offset=0;
  const add=(values,type,componentType)=>{
    const bytes=componentType===5125?Buffer.from(new Uint32Array(values).buffer):Buffer.from(new Float32Array(values).buffer),count=values.length/({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type]);
    const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});parts.push(bytes);offset+=bytes.length;
    const accessor={bufferView:view,componentType,count,type};
    if(type==='VEC3'){accessor.min=[0,1,2].map(k=>{let n=Infinity;for(let i=k;i<values.length;i+=3)n=Math.min(n,values[i]);return n;});accessor.max=[0,1,2].map(k=>{let n=-Infinity;for(let i=k;i<values.length;i+=3)n=Math.max(n,values[i]);return n;});}
    accessors.push(accessor);return accessors.length-1;
  };
  const primitives=meshes.map((m,i)=>{
    const pos=m.positions.map((x,k)=>k%3===2?-x:x),norm=m.normals.map((x,k)=>k%3===2?-x:x),tri=[];
    for(let k=0;k<m.indices.length;k+=3)tri.push(m.indices[k],m.indices[k+2],m.indices[k+1]);
    return {name:m.name,primitives:[{attributes:{POSITION:add(pos,'VEC3',5126),NORMAL:add(norm,'VEC3',5126),COLOR_0:add(m.colors,'VEC4',5126),TEXCOORD_0:add(m.uv,'VEC2',5126)},indices:add(tri,'SCALAR',5125),material:i}]};
  });
  const json={asset:{version:'2.0',generator:'CampMind continuous forest terrain'},scene:0,scenes:[{nodes:meshes.map((_,i)=>i)}],nodes:meshes.map((m,i)=>({name:m.name,mesh:i})),meshes:primitives,materials:[{name:'Grass earth and riverbed',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.95}},{name:'Transparent shallow stream',alphaMode:'BLEND',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.2}}],buffers:[{byteLength:offset}],bufferViews:views,accessors};
  let header=Buffer.from(JSON.stringify(json));header=Buffer.concat([header,Buffer.alloc((4-header.length%4)%4,32)]);const bin=Buffer.concat(parts),buf=Buffer.alloc(12+8+header.length+8+bin.length);
  buf.writeUInt32LE(0x46546c67);buf.writeUInt32LE(2,4);buf.writeUInt32LE(buf.length,8);buf.writeUInt32LE(header.length,12);buf.writeUInt32LE(0x4e4f534a,16);header.copy(buf,20);buf.writeUInt32LE(bin.length,20+header.length);buf.writeUInt32LE(0x004e4942,24+header.length);bin.copy(buf,28+header.length);return buf;
}
const model=glb([terrain,water]);fs.writeFileSync(path.join(out,'forest-terrain.glb'),model);
let villageArea=0;
for(let i=0;i<village.outline.length;i++){const a=village.outline[i],b=village.outline[(i+1)%village.outline.length];villageArea+=a.x*b.y-a.y*b.x;}villageArea=Math.abs(villageArea)/2;
const meshArea=terrain.indices.length/6*LIMITS.step**2;
const data={version:1,id:'forest-expansion-v1',sourceSha256:createHash('sha256').update(model).digest('hex'),origin:ORIGIN,forward:FORWARD,side:SIDE,limits:LIMITS,villageArea,groundArea:meshArea,areaRatio:meshArea/villageArea,clearings:CLEARINGS.map(p=>({...p,position:logical(p.u,p.v)})),paths:PATHS.map(p=>p.map(([u,v])=>({u,v,position:logical(u,v)}))),...decoration,habitats:Object.fromEntries(Object.entries(HABITATS).map(([s,points])=>[s,points.map(([u,v])=>logical(u,v))])),drinkingWater:WATER_STANDS.map(([u,v])=>logical(u,v)),terrain,water};
fs.writeFileSync(path.join(out,'forest-expansion.json'),JSON.stringify(data));
console.log(JSON.stringify({out,groundArea:meshArea,villageArea,areaRatio:data.areaRatio,triangles:terrain.indices.length/3,trees:data.trees.length,resources:data.resources.length,modelBytes:model.length},null,2));
