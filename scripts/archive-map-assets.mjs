import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(path.resolve(process.cwd()).toLowerCase()!==root.toLowerCase())throw new Error('Run from the current Unity checkout');
const destination=path.join(root,'native/ArtSource/retained-buildings-characters-2026-10-17');
const relative=p=>path.relative(root,p).replaceAll('\\','/');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function copy(source,target){
 const bytes=fs.readFileSync(source);fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==hash(bytes))throw new Error('Refusing to overwrite different archived file: '+target);
 if(!fs.existsSync(target))fs.writeFileSync(target,bytes);
 if(hash(fs.readFileSync(target))!==hash(bytes))throw new Error('Archive verification failed');
 return {source:relative(source),file:path.relative(destination,target).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)};
}
function inspect(file){
 const bytes=fs.readFileSync(file);if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB '+file);
 const jsonLength=bytes.readUInt32LE(12);if(bytes.readUInt32LE(16)!==0x4e4f534a)throw new Error('Missing glTF JSON chunk');
 const gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength));let vertices=0,triangles=0;
 for(const mesh of gltf.meshes??[])for(const p of mesh.primitives){vertices+=gltf.accessors[p.attributes.POSITION].count;const count=gltf.accessors[p.indices??p.attributes.POSITION].count;if((p.mode??4)===4)triangles+=count/3;}
 return {vertices,triangles,meshes:gltf.meshes?.length??0,materials:gltf.materials?.length??0,textures:gltf.textures?.length??0,skins:gltf.skins?.length??0,joints:(gltf.skins??[]).reduce((n,s)=>n+s.joints.length,0),animations:(gltf.animations??[]).map(a=>a.name??'(unnamed)'),externalResources:[...(gltf.buffers??[]),...(gltf.images??[])].filter(r=>r.uri&&!r.uri.startsWith('data:')).map(r=>r.uri)};
}
const sources=JSON.parse(fs.readFileSync(path.join(root,'native/CampMind.Unity/Assets/CampMind/ReferenceSample/sources.json'),'utf8')).sources;
const buildings=[];
const names={manor:'领主宅',dwelling:'民居',gate:'寨门',watchtower:'瞭望塔'};
for(const s of sources){
 const original=path.join(root,'native/ArtSource/reference-sample/tripo-out',s.folder);const folder=path.join(destination,'buildings',s.id);
 const model=copy(path.join(original,'model.glb'),path.join(folder,'model.glb'));if(model.sha256!==s.sha256)throw new Error('Generated source changed: '+s.id);
 const files=[model];for(const name of ['preview.png','rendered_image.webp','task.json'])if(fs.existsSync(path.join(original,name)))files.push(copy(path.join(original,name),path.join(folder,name)));
 files.push(copy(path.join(root,'../模型/模型原图',s.reference),path.join(folder,'reference.png')));
 buildings.push({id:s.id,name:names[s.id],taskId:s.taskId,creditsConsumed:s.credits,model,files,geometry:inspect(path.join(folder,'model.glb')),status:s.id==='gate'?'needs-rebuild-background-contamination':'retained-candidate-needs-new-map-review',issues:s.id==='gate'?['生成结果混入背景房屋、塔楼和地面；原件保留，不作为合格寨门直接使用。','旧样板裁切、屋顶拼接和门扇补件不并入原始模型。']:['生成原件完整保留；新地图中的比例、朝向、轮廓与通行要求尚未验收。']});
}
const blueprint=JSON.parse(fs.readFileSync(path.join(root,'native/CampMind.Unity/Assets/CampMind/Content/scene-blueprint.json'),'utf8'));
const characters=[];
for(const c of blueprint.characters){
 const source=path.join(root,'native/CampMind.Unity/Assets/CampMind/Content/Models',c.asset+'.glb');
 const folder=path.join(destination,'characters',c.id);const model=copy(source,path.join(folder,'model.glb'));const geometry=inspect(path.join(folder,'model.glb'));
 if(geometry.skins===0||!geometry.animations.includes('Idle')||!geometry.animations.includes('Walk'))throw new Error('Character is missing existing rig/locomotion: '+c.id);
 const canonical=path.join(root,'public/assets/models',c.asset,'model.glb');
 const metadata=fs.existsSync(source+'.meta')?copy(source+'.meta',path.join(folder,'source-importer.meta.txt')):null;
 const controllerSource=path.join(root,'native/CampMind.Unity/Assets/CampMind/Content',c.id+'.controller');
 const controller=fs.existsSync(controllerSource)?copy(controllerSource,path.join(folder,'animation.controller')):null;
 const controllerMetadata=fs.existsSync(controllerSource+'.meta')?copy(controllerSource+'.meta',path.join(folder,'source-controller.meta.txt')):null;
 characters.push({id:c.id,name:c.name,assetId:c.asset,model,metadata,controller,controllerMetadata,geometry,canonicalSource:relative(canonical),canonicalMatchesRuntime:fs.existsSync(canonical)&&hash(fs.readFileSync(canonical))===model.sha256,status:'retained-existing-rigged-character',oldDisplayHeight:c.height,placementPolicy:'新地图重新确定出生位置和显示尺度；不沿用旧世界坐标。'});
}
if(buildings.length!==4||characters.length!==10)throw new Error('Unexpected retained asset count');
for(const asset of [...buildings,...characters])if(asset.geometry.externalResources.length)throw new Error('Non-self-contained GLB: '+asset.id);
const manifest={schema:'campmind-retained-assets-v1',date:'2026-10-17',mapStatus:'previous-reference-map-discontinued-awaiting-new-design',counts:{buildings:4,characters:10,totalModels:14},tripoCreditsConsumedPreviously:buildings.reduce((n,a)=>n+a.creditsConsumed,0),newTripoCreditsConsumed:0,buildings,characters,policy:'Original assets are copied and hash-verified; existing runtime references remain unchanged. No old terrain, map coordinates or sample derivatives are part of this reusable asset pack.'};
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const rows=[...buildings.map(a=>`| ${a.name} | buildings/${a.id}/model.glb | ${a.geometry.triangles.toLocaleString('en-US')} | ${a.id==='gate'?'背景污染，须重做/清理':'生成原件，待新图复核'} |`),...characters.map(a=>`| ${a.name}（${a.id}） | characters/${a.id}/model.glb | ${a.geometry.triangles.toLocaleString('en-US')} | 已有骨骼；${a.geometry.animations.join('、')} |`)];
fs.writeFileSync(path.join(destination,'README.md'),`# 建筑与人物保留资产包\n\n当前地图方案已停止，等待用户提供新的地图设计原图。本包只整理可供新地图继续使用的建筑生成原件和已有游戏人物，不包含旧地形、旧布局或样板修补模型。\n\n共 **14个模型：4个建筑原件、10个人物（领主及9名属民）**。所有GLB均验证文件结构、内嵌资源及SHA256；人物另检查骨骼和Idle/Walk动画。新地图中的视觉效果和行为仍需重新接入验收。\n\n| 资产 | 包内文件 | 三角面 | 状态 |\n|---|---|---:|---|\n${rows.join('\n')}\n\n## 保存内容\n\n- 每个建筑目录：Tripo原始GLB、可用预览、生成任务记录和对应单体参考图。\n- 每个人物目录：当前Unity实际使用的GLB，包含已有骨骼及动作，以及当前动画控制器；导入设置另存为文本，避免复制Unity GUID造成冲突。\n- animation.controller保留原游戏的动画状态和转换；引用仍对应原项目GUID。重新导入其他Unity项目时，应按GLB动作名称重新绑定动画引用，不能假定复制控制器后引用自动有效。\n- manifest.json：逐文件原路径、SHA256、字节数、网格统计、动画名称、生成任务ID和已消耗积分。\n- 原有文件未移动或删除，现有Unity资源引用未改动；此目录是经过校验的整理副本。\n\n## 已知问题\n\n- 寨门生成原件混入背景房屋、塔楼及地面，不作为合格独立寨门交付。旧样板的裁切、拼接屋顶和补门扇不混入本包。\n- 领主宅、民居和瞭望塔是保留候选，不代表已符合尚未提供的新地图设计。\n- 旧地图的固定位置、朝向、非等比适配尺寸、围栏轮廓和初始化坐标均不作为新地图约束。人物身份和动画保留。\n- 历史4次Tripo生成共消耗240积分；本次整理不新增生成任务或积分消耗。\n\n## 使用\n\n收到新地图后，优先从本包筛选建筑，复用人物，再根据新图重新规划地形、建筑布局、出生点、碰撞和寻路。\n`, 'utf8');
console.log(JSON.stringify({directory:destination,counts:manifest.counts,verifiedFiles:[...buildings.flatMap(a=>a.files),...characters.flatMap(a=>[a.model,a.metadata,a.controller,a.controllerMetadata].filter(Boolean))].length,riggedCharacters:characters.length,controllers:characters.filter(a=>a.controller).length,canonicalMatches:characters.filter(a=>a.canonicalMatchesRuntime).length,newTripoCreditsConsumed:0},null,2));
