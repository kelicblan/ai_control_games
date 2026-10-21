import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('only the standard game entry launches the 2D version',()=>{
  assert.equal(existsSync(path.join(root,'打开2D像素地图.cmd')),false);
  assert.equal(existsSync(path.join(root,'scripts/unity/open-pixel-map.ps1')),false);
  assert.match(read('scripts/unity/play.ps1'),/scripts[\\/]pixel-world[\\/]launch\.mjs|\.\.\/pixel-world\/launch\.mjs/);
  assert.doesNotMatch(read('scripts/unity/play.ps1'),/village-launch|start-native-slice|new-world-current|Camp-\$Backend/);
});
test('standard editor launcher opens a saved 2D scene rather than an unsaved preview',()=>{
  const editor=read('native/CampMind.Unity/Assets/CampMind/PixelWorld/Editor/PixelWorldEditor.cs');
  assert.doesNotMatch(editor,/OpenPreview|打开独立地图验收场景/);
  assert.match(editor,/PixelGame\.unity/);
  assert.match(editor,/OpenFromLauncher/);
  assert.match(read('scripts/unity/open-editor.ps1'),/PixelWorldEditor\.OpenFromLauncher/);
  assert.match(read('打开Unity编辑器.cmd'),/open-game\.ps1/);
});
test('the committed scene references the actual pixel client script GUID',()=>{
  const base='native/CampMind.Unity/Assets/CampMind/PixelWorld/';
  assert.ok(existsSync(path.join(root,base+'PixelGame.unity')),'saved game scene missing');
  const guid=read(base+'PixelWorldView.cs.meta').match(/guid:\s*(\w+)/)[1];
  assert.ok(read(base+'PixelGame.unity').includes('guid: '+guid));
});
test('formal protocol and data path are consistent and never silently read the old save',()=>{
  assert.match(read('scripts/pixel-world/server.mjs'),/scope:'pixel-game'/);
  assert.doesNotMatch(read('scripts/pixel-world/server.mjs'),/map-preview|pixel-map-preview/);
  assert.match(read('native/CampMind.Unity/Assets/CampMind/PixelWorld/PixelProtocol.cs'),/scope!="pixel-game"/);
  assert.match(read('native/CampMind.Unity/Assets/CampMind/PixelWorld/Editor/PixelWorldEditor.cs'),/pixel-world-v1/);
});
test('the new build produces only the pixel scene and requires a current manifest',()=>{
  assert.ok(existsSync(path.join(root,'scripts/pixel-world/build-manifest.mjs')),'build manifest validation missing');
  const build=read('scripts/unity/build-game.ps1');
  assert.match(build,/PixelGameBuild\.Build/);
  assert.doesNotMatch(build,/build-village|build-new-world/);
});
test('standard build CMD no longer opens an obsolete 3D output folder',()=>{
 assert.ok(existsSync(path.join(root,'生成游戏EXE.cmd')),'standard build CMD missing from working snapshot');
 const cmd=read('生成游戏EXE.cmd');assert.doesNotMatch(cmd,/NewWorld-IL2CPP|Camp-IL2CPP/);assert.match(cmd,/native\\Builds/);
});
test('Unity manifest and snapshot readers use the same formal scope as the server',()=>{
 const client=read('native/CampMind.Unity/Assets/CampMind/PixelWorld/PixelWorldClient.cs');
 assert.doesNotMatch(client,/map-preview|打开2D像素地图\.cmd/);
 assert.match(client,/m\.scope=="pixel-game"/);assert.match(client,/s\?\.scope=="pixel-game"/);
});
test('an old editor-open request cannot switch scenes during a batch build',()=>{
 const editor=read('native/CampMind.Unity/Assets/CampMind/PixelWorld/Editor/PixelWorldEditor.cs');
 assert.match(editor,/if\(Application\.isBatchMode\|\|BuildPipeline\.isBuildingPlayer\)return;/);
});
