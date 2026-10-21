import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveVillageLaunch } from '../scripts/unity/village-launch.mjs';
import { publishVillagePackage, machineVillageBuildRoot } from '../scripts/unity/village-package.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'campmind-village-launch-'));
  mkdirSync(path.join(root, 'native/Builds/Village'), { recursive: true });
  mkdirSync(path.join(root, 'public/models/village-v4'), { recursive: true });
  const executable = path.join(root, 'native/Builds/Village/CampMind.exe');
  writeFileSync(executable, 'verified fixture executable');
  writeFileSync(path.join(path.dirname(executable), 'GameAssembly.dll'), 'verified game code');
  const release = JSON.stringify({ models: { life: 'life-hash', tactical: 'tactical-hash' } });
  writeFileSync(path.join(root, 'public/models/village-v4/release.json'), release);
  const manifest = { format: 'campmind-village-current-v1', verified: true, executable,
    layout: 'new-world-v1', releaseHash: createHash('sha256').update(release).digest('hex'),
    executableHash: createHash('sha256').update('verified fixture executable').digest('hex'),
    gameAssemblyHash: createHash('sha256').update('verified game code').digest('hex') };
  const save = () => writeFileSync(path.join(root, 'native/Builds/village-current.json'), JSON.stringify(manifest));
  return { root, manifest, save, executable };
}

test('without a verified village promotion the launcher retains its current route', () => {
  const f = fixture();
  assert.equal(resolveVillageLaunch(f.root), null);
});
test('changed IL2CPP game code cannot reuse a verified executable marker', () => {
  const f = fixture(); f.save();
  writeFileSync(path.join(path.dirname(f.executable), 'GameAssembly.dll'), 'old game code');
  assert.throws(() => resolveVillageLaunch(f.root), /game code/);
});

test('animal-enabled promotion rejects missing or changed animal weights',()=>{
 const f=fixture();f.manifest.animalModelHash=createHash('sha256').update('animal weights').digest('hex');f.save();
 assert.throws(()=>resolveVillageLaunch(f.root),/Animal model/);
 mkdirSync(path.join(f.root,'public/models/animal-v1'),{recursive:true});writeFileSync(path.join(f.root,'public/models/animal-v1/weights.json'),'animal weights');
 assert.equal(resolveVillageLaunch(f.root).executable,f.executable);
 writeFileSync(path.join(f.root,'public/models/animal-v1/weights.json'),'changed');assert.throws(()=>resolveVillageLaunch(f.root),/Animal model/);
});
test('verified village promotion selects the exact executable and default mode', () => {
  const f = fixture(); f.save();
  assert.deepEqual(resolveVillageLaunch(f.root), { executable: f.executable, layout: 'new-world-v1', externalBuild: false, villageDefault: true });
});
test('promotion rejects unverified or changed builds and model releases', () => {
  const f = fixture(); f.manifest.verified = false; f.save();
  assert.throws(() => resolveVillageLaunch(f.root), /verified/);
  f.manifest.verified = true; f.save(); writeFileSync(f.executable, 'different build');
  assert.throws(() => resolveVillageLaunch(f.root), /executable/);
  writeFileSync(f.executable, 'verified fixture executable');
  writeFileSync(path.join(f.root, 'public/models/village-v4/release.json'), '{}');
  assert.throws(() => resolveVillageLaunch(f.root), /release/);
});

test('a published package launches with a different LOCALAPPDATA and still rejects changed code', () => {
  const f = fixture();
  mkdirSync(path.join(path.dirname(f.executable), 'CampMind_Data'));
  const external = path.join(f.root, 'original-user/CampMindBuilds/Village');
  cpSync(path.dirname(f.executable), external, { recursive: true });
  f.manifest.executable = path.join(external, 'CampMind.exe'); f.save();
  const before = process.env.LOCALAPPDATA;
  try {
    process.env.LOCALAPPDATA = path.join(f.root, 'another-user');
    assert.throws(() => resolveVillageLaunch(f.root), error => error.code === 'VILLAGE_PATH_REJECTED');
    f.manifest.executable = publishVillagePackage(f.root, f.manifest.executable, f.manifest); f.save();
    assert.equal(resolveVillageLaunch(f.root).executable, f.manifest.executable);
    writeFileSync(path.join(path.dirname(f.manifest.executable), 'GameAssembly.dll'), 'changed');
    assert.throws(() => resolveVillageLaunch(f.root), /game code/);
  } finally {
    if (before === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = before;
  }
});

test('missing executable reports the exact failing check and path', () => {
  const f = fixture(); f.manifest.executable = path.join(f.root, 'native/Builds/missing/CampMind.exe'); f.save();
  assert.throws(() => resolveVillageLaunch(f.root), error => error.code === 'VILLAGE_EXE_MISSING' && error.message.includes(f.manifest.executable));
});

test('machine-wide release remains launchable after the source executable changes', () => {
  const f = fixture();
  mkdirSync(path.join(path.dirname(f.executable), 'CampMind_Data'));
  const before = process.env.ProgramData;
  try {
    process.env.ProgramData = path.join(f.root, 'machine-data');
    f.manifest.executable = publishVillagePackage(f.root, f.executable, f.manifest, machineVillageBuildRoot());
    f.save();
    writeFileSync(f.executable, 'source changed');
    assert.equal(resolveVillageLaunch(f.root).executable, f.manifest.executable);
    assert.equal(resolveVillageLaunch(f.root).externalBuild, true);
  } finally {
    if (before === undefined) delete process.env.ProgramData; else process.env.ProgramData = before;
  }
});

test('a second release reuses immutable scenery without tying either release to mutable build files',()=>{
  const f=fixture(),source=path.dirname(f.executable);mkdirSync(path.join(source,'CampMind_Data'));
  writeFileSync(path.join(source,'CampMind_Data/shared.bin'),'immutable scenery');
  const first=publishVillagePackage(f.root,f.executable,f.manifest);f.manifest.executable=first;f.save();
  writeFileSync(path.join(source,'GameAssembly.dll'),'new native game code');
  f.manifest.gameAssemblyHash=createHash('sha256').update('new native game code').digest('hex');
  const second=publishVillagePackage(f.root,f.executable,f.manifest);
  writeFileSync(path.join(source,'CampMind_Data/shared.bin'),'changed source scenery');
  assert.equal(readFileSync(path.join(path.dirname(second),'CampMind_Data/shared.bin'),'utf8'),'immutable scenery');
  assert.equal(readFileSync(path.join(path.dirname(second),'GameAssembly.dll'),'utf8'),'new native game code');
  assert.notEqual(readFileSync(path.join(path.dirname(first),'GameAssembly.dll'),'utf8'),'new native game code');
});
