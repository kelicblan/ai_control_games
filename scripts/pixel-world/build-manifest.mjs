/** 正式二维客户端构建清单：不接受旧3D包、不把源码更新等同于本机EXE已更新。 */
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync,renameSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const SCENE='Assets/CampMind/PixelWorld/PixelGame.unity';
export const SOURCE_ROOTS=['scripts/pixel-world','scripts/world','scripts/mlp_v4','scripts/native-models','src/games/camp','packages/pixel-world-core','packages/action-runtime','packages/world-core','packages/policy-runtime','packages/social-core','packages/npc-core','packages/npc-dialogue','packages/npc-settings','config/village','config/animals','public/models','native/CampMind.Unity/Assets/CampMind/PixelWorld','native/CampMind.Unity/Assets/CampMind/Presentation'];
const sourceRoots=SOURCE_ROOTS;
const digest=data=>createHash('sha256').update(data).digest('hex');
function listFiles(directory){
 const result=[];
 for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const file=path.join(directory,entry.name);
  if(entry.isSymbolicLink())throw new Error('构建输入或产物不允许符号链接：'+file);
  if(entry.isDirectory())result.push(...listFiles(file));else if(entry.isFile())result.push(file);
 }
 return result;
}
export function sourceFingerprint(root){
 const hash=createHash('sha256');
 const assetRoot='native/CampMind.Unity/Assets/ThirdParty/TinySwords';
 for(const relative of [...sourceRoots,...(existsSync(path.join(root,assetRoot))?[assetRoot]:[])]){
  const directory=path.join(root,relative);if(!existsSync(directory))throw new Error('缺少二维源码目录：'+relative);
  for(const file of listFiles(directory).filter(p=>/\.(?:mjs|ts|json|cs|asmdef|shader|hlsl|unity|meta|asset|png|txt|bin|f32)$/.test(p))){
   hash.update(path.relative(root,file).split(path.sep).join('/')+'\0');
   hash.update(/\.(?:png|bin|f32)$/.test(file)?readFileSync(file):readFileSync(file,'utf8').replace(/\r\n/g,'\n'));hash.update('\0');
  }
 }
 return hash.digest('hex');
}
function safeRelative(value){return typeof value==='string'&&value.length>0&&!value.includes('\\')&&!value.includes(':')&&!value.split('/').some(p=>!p||p==='.'||p==='..')&&!path.isAbsolute(value);}
function buildDirectory(root,executable){
 if(typeof executable!=='string'||path.basename(executable)!=='CampMind.exe')throw new Error('无效游戏EXE路径');
 const builds=path.resolve(root,'native/Builds'),exe=path.resolve(executable),relative=path.relative(builds,exe);
 if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative)||relative.split(path.sep).length<2)throw new Error('游戏必须位于本工程 native/Builds 的独立目录');
 if(!existsSync(exe)||lstatSync(exe).isSymbolicLink())throw new Error('游戏EXE不存在或是链接');
 const actual=path.relative(realpathSync(builds),realpathSync(exe));
 if(actual.startsWith('..'+path.sep)||path.isAbsolute(actual))throw new Error('构建路径越出 native/Builds');
 return path.dirname(exe);
}
function requiredFiles(files){for(const required of ['CampMind.exe','UnityPlayer.dll','GameAssembly.dll','CampMind_Data/globalgamemanagers'])if(!files.some(f=>f.path===required))throw new Error('二维IL2CPP包不完整：缺少 '+required);}
function artifactList(directory){return listFiles(directory).map(file=>{const data=readFileSync(file);return{path:path.relative(directory,file).split(path.sep).join('/'),bytes:data.length,sha256:digest(data)};});}
function atomicJson(file,value){mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');renameSync(tmp,file);}
export function publishBuild(root,reportFile){
 const report=JSON.parse(readFileSync(reportFile,'utf8'));
 if(report.success!==true)throw new Error('Unity构建未成功，保留上一个构建指针');
 if(report.scene!==SCENE||report.backend!=='IL2CPP')throw new Error('构建不是正式二维场景或IL2CPP后端');
 const sourceHash=sourceFingerprint(root);if(report.sourceHash!==sourceHash)throw new Error('构建期间源码发生变化，请重新生成游戏EXE');
 const directory=buildDirectory(root,report.executable),files=artifactList(directory);requiredFiles(files);
 const value={kind:'campmind-pixel-game-v1',layout:'pixel-region-v1',scene:SCENE,backend:'IL2CPP',sourceHash,executable:path.resolve(report.executable),files,builtAt:new Date().toISOString(),runtimeValidated:false};
 const current=path.join(root,'native/Builds/pixel-current.json');
 if(existsSync(current))atomicJson(path.join(root,'native/Artifacts/pixel-build-manifests',Date.now()+'-'+randomUUID()+'.json'),JSON.parse(readFileSync(current,'utf8')));
 atomicJson(current,value);return value;
}
export function validateBuild(root){
 const file=path.join(root,'native/Builds/pixel-current.json');
 if(!existsSync(file))throw new Error('尚未生成当前二维游戏，请先双击“生成游戏EXE.cmd”；不会回退启动旧3D游戏。');
 const m=JSON.parse(readFileSync(file,'utf8'));
 if(m.kind!=='campmind-pixel-game-v1'||m.layout!=='pixel-region-v1'||m.scene!==SCENE||m.backend!=='IL2CPP'||!Array.isArray(m.files))throw new Error('当前构建清单不是二维游戏');
 if(m.sourceHash!==sourceFingerprint(root))throw new Error('二维源码已更新，现有EXE已过期；请重新运行“生成游戏EXE.cmd”。');
 const directory=buildDirectory(root,m.executable);const seen=new Set();
 for(const entry of m.files){
  if(!safeRelative(entry.path)||seen.has(entry.path))throw new Error('构建文件路径无效或重复');seen.add(entry.path);
  const file=path.join(directory,...entry.path.split('/'));
  if(!existsSync(file)||lstatSync(file).isSymbolicLink())throw new Error('构建文件校验失败：'+entry.path);
  const rel=path.relative(realpathSync(directory),realpathSync(file));if(rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('构建文件路径越界');
  const bytes=readFileSync(file);if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error('构建文件校验失败：'+entry.path);
 }
 requiredFiles(m.files);return m;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 try{const mode=process.argv[2];if(mode==='fingerprint')console.log(sourceFingerprint(root));else if(mode==='publish'&&process.argv[3])console.log(JSON.stringify(publishBuild(root,path.resolve(process.argv[3]))));else if(mode==='validate')console.log(JSON.stringify(validateBuild(root)));else throw new Error('用法：build-manifest.mjs fingerprint | publish 报告路径 | validate');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
