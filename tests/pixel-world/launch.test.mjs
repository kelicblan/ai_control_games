/** 真实宿主生命周期测试；客户端是明确的Node子进程夹具，不伪装Unity实机验收。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {publishBuild,sourceFingerprint} from '../../scripts/pixel-world/build-manifest.mjs';
import {launchGame} from '../../scripts/pixel-world/launch.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'pixel-launch-unit-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const p of ['scripts/pixel-world','src/games/camp/world/pixel','packages/pixel-world-core','native/CampMind.Unity/Assets/CampMind/PixelWorld']){mkdirSync(path.dirname(path.join(root,p)),{recursive:true});cpSync(path.join(repo,p),path.join(root,p),{recursive:true});}
 const directory=path.join(root,'native/Builds/PixelGame-fixture');mkdirSync(path.join(directory,'CampMind_Data'),{recursive:true});
 for(const p of ['CampMind.exe','UnityPlayer.dll','GameAssembly.dll','CampMind_Data/globalgamemanagers'])writeFileSync(path.join(directory,p),'MZ-unit-test-fixture');
 const report=path.join(root,'report.json');writeFileSync(report,JSON.stringify({success:true,backend:'IL2CPP',scene:'Assets/CampMind/PixelWorld/PixelGame.unity',executable:path.join(directory,'CampMind.exe'),sourceHash:sourceFingerprint(root)}));publishBuild(root,report);return root;}
test('default launcher uses the new versioned save and closes only its owned host',async t=>{
 const root=fixture(t);let connection;
 const result=await launchGame({root,spawnPlayer:(exe,args,options)=>{assert.match(exe,/PixelGame-fixture/);assert.equal(options.windowsHide,false);connection=args[1];assert.equal(JSON.parse(readFileSync(connection,'utf8')).scope,'pixel-game');return spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),40)']);}});
 assert.equal(result.code,0);assert.equal(existsSync(connection),false);assert.equal(existsSync(result.database+'.pixel-lock'),false);
 assert.match(result.database,/pixel-world-v1/);assert.equal(existsSync(path.join(root,'native/LocalData/new-world-v1/world.sqlite')),false);
});
test('synchronous player launch failure still releases the host lock and connection',async t=>{
 const root=fixture(t);let connection;
 await assert.rejects(launchGame({root,spawnPlayer:(_,args)=>{connection=args[1];throw new Error('declared child fixture launch failure');}}),/fixture launch failure/);
 assert.equal(existsSync(connection),false);assert.equal(existsSync(path.join(root,'native/LocalData/pixel-world-v1/world.sqlite.pixel-lock')),false);
});
test('a failed player exit is not reported as a successful game run',async t=>{
 const root=fixture(t);await assert.rejects(launchGame({root,spawnPlayer:()=>spawn(process.execPath,['-e','process.exit(7)'])}),/异常退出：7/);
 assert.equal(existsSync(path.join(root,'native/LocalData/pixel-world-v1/world.sqlite.pixel-lock')),false);
});
