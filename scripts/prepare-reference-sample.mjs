import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=path.join(root,'native/ArtSource/reference-sample/tripo-out');
const destination=path.join(root,'native/CampMind.Unity/Assets/CampMind/ReferenceSample');
const entries=[['manor','sample-lord-house-8395bc02','领主宅.png'],['dwelling','sample-dwelling-c2c2c17f','属民屋.png'],['gate','sample-gate-28906808','围栏和寨门.png'],['watchtower',null,'瞭望塔.png']];
function inspect(file){
  const bytes=fs.readFileSync(file);
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error(`Invalid GLB: ${file}`);
  const length=bytes.readUInt32LE(12);const doc=JSON.parse(bytes.toString('utf8',20,20+length));
  let triangles=0,vertices=0;
  for(const mesh of doc.meshes??[])for(const p of mesh.primitives){if((p.mode??4)!==4)throw new Error(`Non-triangle mesh: ${file}`);vertices+=doc.accessors[p.attributes.POSITION].count;triangles+=(p.indices!==undefined?doc.accessors[p.indices].count:doc.accessors[p.attributes.POSITION].count)/3;}
  if(vertices===0||triangles===0)throw new Error(`Empty mesh: ${file}`);
  return {bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),vertices,triangles,meshes:doc.meshes.length,materials:doc.materials?.length??0,textures:doc.images?.length??0};
}
// Validate every paid source before copying anything; incomplete batches fail closed.
const rows=entries.map(([id,folder,reference])=>{
  if(!folder){const found=fs.readdirSync(sourceRoot).filter(n=>n.startsWith('sample-watchtower-'));if(found.length!==1)throw new Error('Expected one approved watchtower result');folder=found[0];}
  const dir=path.join(sourceRoot,folder);const task=JSON.parse(fs.readFileSync(path.join(dir,'task.json'),'utf8'));
  if(task.status!=='success')throw new Error(`Unsuccessful source ${id}`);
  return {id,reference,folder,taskId:task.task_id,credits:task.credits_consumed,...inspect(path.join(dir,'model.glb'))};
});
fs.mkdirSync(path.join(destination,'Models'),{recursive:true});
for(const row of rows)fs.copyFileSync(path.join(sourceRoot,row.folder,'model.glb'),path.join(destination,'Models',row.id+'.glb'));
fs.copyFileSync(path.join(root,'public/assets/models/valley/terrain/bedrock-albedo.png'),path.join(destination,'bedrock.png'));
const manifest={date:'2026-10-17',sources:rows,totalCredits:rows.reduce((n,r)=>n+Number(r.credits),0),character:'existing lord — no generation',referenceDirectory:'../模型/模型原图',status:'sources-prepared-not-visual-accepted'};
fs.writeFileSync(path.join(destination,'sources.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
