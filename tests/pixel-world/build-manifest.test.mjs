/** 构建清单单元测试使用明确的假 PE 文件，不启动它们，不当作 Unity 构建证据。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {SOURCE_ROOTS,sourceFingerprint,publishBuild,validateBuild} from '../../scripts/pixel-world/build-manifest.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function fixture(t){
 const root=mkdtempSync(path.join(tmpdir(),'pixel-build-unit-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const p of SOURCE_ROOTS){mkdirSync(path.dirname(path.join(root,p)),{recursive:true});cpSync(path.join(repo,p),path.join(root,p),{recursive:true});}
 const directory=path.join(root,'native/Builds/PixelGame-test');mkdirSync(path.join(directory,'CampMind_Data'),{recursive:true});
 for(const p of ['CampMind.exe','UnityPlayer.dll','GameAssembly.dll','CampMind_Data/globalgamemanagers'])writeFileSync(path.join(directory,p),'MZ-unit-test-fixture-not-an-executable');
 const report={success:true,backend:'IL2CPP',scene:'Assets/CampMind/PixelWorld/PixelGame.unity',executable:path.join(directory,'CampMind.exe'),sourceHash:sourceFingerprint(root)};
 const file=path.join(root,'report.json');writeFileSync(file,JSON.stringify(report));return{root,directory,file,report};
}
test('publishes a hash-checked pixel-only manifest and validates it',t=>{const f=fixture(t);publishBuild(f.root,f.file);const m=validateBuild(f.root);assert.equal(m.layout,'pixel-region-v1');assert.equal(m.kind,'campmind-pixel-game-v1');assert.equal(m.files.length,4);});
test('rejects missing game builds instead of falling back to old 3D',t=>{const f=fixture(t);assert.throws(()=>validateBuild(f.root),/生成游戏EXE/);});
test('rejects an old scene even with a successful build report',t=>{const f=fixture(t);writeFileSync(f.file,JSON.stringify({...f.report,scene:'Assets/CampMind/Scenes/Camp.unity'}));assert.throws(()=>publishBuild(f.root,f.file),/二维场景/);});
test('rejects a failed Unity build and keeps the previous current pointer',t=>{const f=fixture(t);publishBuild(f.root,f.file);const old=readFileSync(path.join(f.root,'native/Builds/pixel-current.json'),'utf8');writeFileSync(f.file,JSON.stringify({...f.report,success:false}));assert.throws(()=>publishBuild(f.root,f.file),/构建未成功/);assert.equal(readFileSync(path.join(f.root,'native/Builds/pixel-current.json'),'utf8'),old);});
test('rejects a source change during build or after publication',t=>{const f=fixture(t);publishBuild(f.root,f.file);writeFileSync(path.join(f.root,'scripts/pixel-world/server.mjs'),'// changed');assert.throws(()=>validateBuild(f.root),/源码/);assert.throws(()=>publishBuild(f.root,f.file),/源码/);});

test('图集PNG与Resources引用变化也会令旧EXE过期',t=>{
 const f=fixture(t),assets=path.join(f.root,'native/CampMind.Unity/Assets/ThirdParty/TinySwords');mkdirSync(assets,{recursive:true});
 const image=path.join(assets,'tree.png');writeFileSync(image,Buffer.from([137,80,78,71,255]));
 const first=sourceFingerprint(f.root);writeFileSync(image,Buffer.from([137,80,78,71,254]));assert.notEqual(sourceFingerprint(f.root),first);
 const catalog=path.join(f.root,'native/CampMind.Unity/Assets/CampMind/PixelWorld/Resources/PixelWorld/TinySwords.asset');
 const before=sourceFingerprint(f.root);writeFileSync(catalog,'changed-reference');assert.notEqual(sourceFingerprint(f.root),before);
});
test('rejects changed or missing native components',t=>{const f=fixture(t);publishBuild(f.root,f.file);writeFileSync(path.join(f.directory,'GameAssembly.dll'),'changed');assert.throws(()=>validateBuild(f.root),/校验/);rmSync(path.join(f.directory,'GameAssembly.dll'));assert.throws(()=>publishBuild(f.root,f.file),/GameAssembly/);});
test('rejects executable outside the repository build root',t=>{const f=fixture(t);writeFileSync(f.file,JSON.stringify({...f.report,executable:path.join(f.root,'CampMind.exe')}));assert.throws(()=>publishBuild(f.root,f.file),/Builds/);});
test('rejects malicious traversal in a build artifact manifest',t=>{const f=fixture(t);publishBuild(f.root,f.file);const p=path.join(f.root,'native/Builds/pixel-current.json'),m=JSON.parse(readFileSync(p,'utf8'));m.files[0].path='../outside';writeFileSync(p,JSON.stringify(m));assert.throws(()=>validateBuild(f.root),/路径/);});
