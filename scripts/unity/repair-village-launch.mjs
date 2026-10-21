import { readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVillageLaunch } from './village-launch.mjs';
import { publishVillagePackage, machineVillageBuildRoot } from './village-package.mjs';

export function repairVillageLaunch(root) {
  const launch = resolveVillageLaunch(root);
  if (!launch || launch.executable.toLowerCase().startsWith((machineVillageBuildRoot() + path.sep).toLowerCase())) return launch;
  const marker = path.join(root, 'native/Builds/village-current.json');
  const original = readFileSync(marker, 'utf8');
  const manifest = JSON.parse(original);
  const executable = publishVillagePackage(root, launch.executable, manifest, machineVillageBuildRoot());
  if (readFileSync(marker, 'utf8') !== original) throw new Error('Village promotion changed during repair; retry against the current release');
  copyFileSync(marker, marker + '.previous-' + randomUUID());
  const temporary = marker + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify({ ...manifest, executable }, null, 2));
  renameSync(temporary, marker);
  return resolveVillageLaunch(root);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(repairVillageLaunch(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'))));
}
