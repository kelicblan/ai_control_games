import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
if(path.resolve(process.cwd()).toLowerCase()!=='d:\\workspace_zsfz\\ai_control_games\\ai_control_games_unity')throw Error('Wrong checkout');
const source='native/ArtSource/new-world-20261017/stairs/generated/tripo-out/new-world-main-hall-stairs-342ec84b';
const task=JSON.parse(fs.readFileSync(source+'/task.json','utf8'));const b=fs.readFileSync(source+'/model.glb');
if(task.task_id!=='342ec84b-faee-4b0c-a1ec-5d8f03520d5b'||task.status!=='success'||task.credits_consumed!==60)throw Error('Unexpected paid task');
if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB');
const g=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));let triangles=0;
for(const m of g.meshes)for(const p of m.primitives){if((p.mode??4)!==4)throw Error('Non-triangle mesh');triangles+=g.accessors[p.indices??p.attributes.POSITION].count/3;}
if(triangles>40000||triangles<100)throw Error('Unexpected face count');
for(const r of [...g.images,...g.buffers])if(r.uri&&!r.uri.startsWith('data:'))throw Error('External resource');
const dest='native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models/stairs';fs.mkdirSync(dest,{recursive:true});
const hash=crypto.createHash('sha256').update(b).digest('hex');const target=dest+'/main-hall-stairs.glb';
if(fs.existsSync(target)&&!fs.readFileSync(target).equals(b))throw Error('Refuse overwrite');fs.writeFileSync(target,b);
const manifest={task:task.task_id,credits:60,triangles,bytes:b.length,sha256:hash,images:g.images.length,positionAccessors:g.accessors.filter(a=>a.type==='VEC3'&&a.min&&a.max).map(a=>({min:a.min,max:a.max,count:a.count})),source:source+'/model.glb'};
fs.writeFileSync(dest+'/source.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
