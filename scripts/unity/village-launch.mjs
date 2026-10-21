import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync, lstatSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, userInfo } from 'node:os';
import { machineVillageBuildRoot } from './village-package.mjs';

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
function fileAccess(file) {
  try { const s = statSync(file); return { path: file, readable: true, file: s.isFile(), bytes: s.size, nodeReadAllowed: process.permission?.has('fs.read', file) }; }
  catch (error) { return { path: file, readable: false, code: error.code, message: error.message, nodeReadAllowed: process.permission?.has('fs.read', file) }; }
}
export function resolveVillageLaunch(root) {
  const marker = path.join(root, 'native/Builds/village-current.json');
  if (!existsSync(marker)) return null;
  const current = JSON.parse(readFileSync(marker, 'utf8'));
  if (current.format !== 'campmind-village-current-v1' || current.verified !== true || current.layout !== 'new-world-v1') throw new Error('Village promotion must be verified');
  const executable = path.resolve(current.executable);
  const localRoot = path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData/Local'), 'CampMindBuilds');
  const inside = directory => executable.toLowerCase().startsWith((path.resolve(directory) + path.sep).toLowerCase());
  const internal = inside(path.join(root, 'native/Builds'));
  if (!internal && !inside(localRoot) && !inside(machineVillageBuildRoot())) fail('VILLAGE_PATH_REJECTED', `Village executable path is outside allowed build roots: ${executable}; local root: ${localRoot}`);
  if (path.basename(executable) !== 'CampMind.exe') fail('VILLAGE_EXE_NAME', `Invalid village executable name: ${executable}`);
  if (!existsSync(executable)) fail('VILLAGE_EXE_MISSING', `Village executable is missing: ${executable}`);
  const actualHash = hash(executable);
  if (actualHash !== current.executableHash) fail('VILLAGE_EXE_HASH', `Village executable hash mismatch: ${executable}; expected ${current.executableHash}; actual ${actualHash}`);
  const gameCode = path.join(path.dirname(executable), 'GameAssembly.dll');
  if (!existsSync(gameCode) || hash(gameCode) !== current.gameAssemblyHash) fail('VILLAGE_CODE_MISMATCH', `Village game code does not match the verified build: ${gameCode}`);
  const release = path.join(root, 'public/models/village-v4/release.json');
  if (!existsSync(release) || hash(release) !== current.releaseHash) throw new Error('Village model release does not match the verified build');
  const animal=path.join(root,'public/models/animal-v1/weights.json');
  if(current.animalModelHash&&(!existsSync(animal)||hash(animal)!==current.animalModelHash))throw new Error('Animal model does not match the verified build');
  return { executable, layout: current.layout, externalBuild: !internal, villageDefault: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  try { console.log(JSON.stringify(resolveVillageLaunch(root))); }
  catch (error) {
    const report = { time: new Date().toISOString(), code: error.code, message: error.message, cwd: process.cwd(), node: process.execPath, localAppData: process.env.LOCALAPPDATA };
    try {
      const current = JSON.parse(readFileSync(path.join(root, 'native/Builds/village-current.json'), 'utf8'));
      const directory = path.dirname(current.executable);
      report.user = userInfo().username; report.arch = process.arch; report.nodeVersion = process.version;
      report.access = [fileAccess(directory), fileAccess(current.executable)];
      if (lstatSync(directory).isSymbolicLink()) { report.linkTarget = readlinkSync(directory); report.access.push(fileAccess(path.join(report.linkTarget, 'CampMind.exe'))); }
    } catch (diagnosticError) { report.inspectionError = diagnosticError.message; }
    const destination = path.join(root, 'native/Artifacts/launch-errors', `${Date.now()}-${process.pid}.json`);
    try { mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, JSON.stringify(report, null, 2)); console.error(`启动诊断已保存：${destination}`); } catch (writeError) { console.error(`无法保存启动诊断：${writeError.message}`); }
    console.error(`[${error.code ?? 'VILLAGE_LAUNCH_FAILED'}] ${error.message}`);
    process.exitCode = 1;
  }
}
