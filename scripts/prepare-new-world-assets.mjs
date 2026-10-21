import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(path.resolve(process.cwd()).toLowerCase()!==root.toLowerCase())throw new Error('Run from Unity checkout');
const stage2=process.argv.includes('--stage2');
const stage3=process.argv.includes('--stage3');
const terrain=process.argv.includes('--terrain');
if(process.argv.slice(2).some(arg=>!['--stage2','--stage3','--terrain'].includes(arg))||[stage2,stage3,terrain].filter(Boolean).length>1)throw new Error('Select one approved batch');
const batch=terrain?'terrain':stage3?'stage3':stage2?'stage2':'sample';
const prefix=terrain?'new-world-':'new-world-'+batch+'-';
const source=path.join(root,'native/ArtSource/new-world-20261017',batch==='sample'?'generated/tripo-out':'generated-'+batch+'/tripo-out');
const dest=path.join(root,'native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models',batch==='sample'?'':batch);
const entries=terrain?[['terrain-base','09_terrain_base.png']]:stage3?[['gate','05_village_gate.png'],['palisade','06_palisade_wall.png'],['low-fence','07_low_fence.png'],['bridge','08_wooden_bridge.png']]:stage2?[['hall','01_lord_main_hall.png'],['large-house','03_large_village_house.png'],['watchtower','04_watchtower.png'],['spreading-pine','13_spreading_pine.png'],['broadleaf','14_broadleaf_tree.png'],['snow-range','11_snow_mountains.png']]:[['house','02_village_house.png'],['conifer','12_tall_conifer.png'],['rock','10_rocky_peak.png']];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const rows=entries.map(([id,reference])=>{
  const matches=fs.readdirSync(source).filter(n=>n.startsWith(prefix+id+'-'));
  if(matches.length!==1)throw new Error(`Expected exactly one approved result for ${id}`);
  const folder=path.join(source,matches[0]);const task=JSON.parse(fs.readFileSync(path.join(folder,'task.json'),'utf8'));
  if(task.status!=='success'||typeof task.credits_consumed!=='number')throw new Error(`Incomplete task ${id}`);
  const bytes=fs.readFileSync(path.join(folder,'model.glb'));
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error(`Invalid GLB ${id}`);
  const doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  let triangles=0,vertices=0;
  for(const mesh of doc.meshes??[])for(const p of mesh.primitives){
    if((p.mode??4)!==4)throw new Error('Unsupported primitive mode');
    const count=doc.accessors[p.attributes.POSITION].count;vertices+=count;triangles+=(p.indices!==undefined?doc.accessors[p.indices].count:count)/3;
  }
  if(vertices===0||triangles===0)throw new Error('Empty geometry');
  if(terrain&&(task.task_id!=='47721ef6-cffe-487a-94bf-ff2e4974801e'||triangles>150000||task.credits_consumed!==60))throw new Error('Terrain task differs from approved generation; inspect before import');
  for(const image of doc.images??[])if(image.uri&&!image.uri.startsWith('data:'))throw new Error('External image requires explicit copy');
  for(const buffer of doc.buffers??[])if(buffer.uri&&!buffer.uri.startsWith('data:'))throw new Error('External buffer requires explicit copy');
  const referenceFile=path.join(root,'native/ArtSource/new-world-20261017/reference-pack/04_model_references',reference);
  return {id,reference,referenceSha256:hash(fs.readFileSync(referenceFile)),taskId:task.task_id,credits:task.credits_consumed,
    bytes:bytes.length,sha256:hash(bytes),triangles,vertices,materials:doc.materials?.length??0,images:doc.images?.length??0,
    source:path.relative(root,path.join(folder,'model.glb')).replaceAll('\\','/'),visualAccepted:false};
});
// Validate the complete batch before any runtime source is copied.
fs.mkdirSync(dest,{recursive:true});
for(const row of rows){const target=path.join(dest,row.id+'.glb');const bytes=fs.readFileSync(path.join(root,row.source));
  if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==row.sha256)throw new Error(`Refusing to overwrite changed model ${row.id}`);
  fs.writeFileSync(target,bytes);if(hash(fs.readFileSync(target))!==row.sha256)throw new Error('Copy hash mismatch');
}
const manifest={schema:'new-world-approved-sample-assets-v1',batch,sources:rows,totalCredits:rows.reduce((sum,r)=>sum+r.credits,0),visualAccepted:false,character:'Existing lord, no paid generation'};
fs.writeFileSync(path.join(dest,'sources.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
