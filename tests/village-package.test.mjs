import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishVillagePackage } from '../scripts/unity/village-package.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');

test('publish addresses the complete verified package from the checkout independently of user environment', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'village-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'user-cache');
  mkdirSync(path.join(source, 'CampMind_Data/StreamingAssets'), { recursive: true });
  writeFileSync(path.join(source, 'CampMind.exe'), 'exe');
  writeFileSync(path.join(source, 'GameAssembly.dll'), 'code');
  writeFileSync(path.join(source, 'CampMind_Data/StreamingAssets/scene'), 'scene');
  const expected = { executableHash: hash('exe'), gameAssemblyHash: hash('code') };
  const executable = publishVillagePackage(root, path.join(source, 'CampMind.exe'), expected);
  assert.equal(lstatSync(path.dirname(executable)).isSymbolicLink(), false, 'published package must be real files');
  assert.ok(executable.startsWith(path.join(root, 'native/Builds') + path.sep));
  assert.equal(readFileSync(path.join(path.dirname(executable), 'CampMind_Data/StreamingAssets/scene'), 'utf8'), 'scene');
  assert.ok(existsSync(path.join(source, 'CampMind.exe')), 'source is retained');
  writeFileSync(path.join(source, 'GameAssembly.dll'), 'modified');
  assert.throws(() => publishVillagePackage(root, path.join(source, 'CampMind.exe'), expected), /game code/);
  assert.equal(readFileSync(path.join(path.dirname(executable), 'GameAssembly.dll'), 'utf8'), 'code');
  rmSync(source, { recursive: true });
  assert.equal(readFileSync(executable, 'utf8'), 'exe', 'source cache removal must not break the release');
});
