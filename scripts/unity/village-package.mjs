import { existsSync, mkdirSync, readFileSync, copyFileSync, linkSync, readdirSync, statSync, openSync,readSync,closeSync,renameSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';

export const machineVillageBuildRoot = () => path.join(process.env.ProgramData || path.join(path.parse(homedir()).root, 'ProgramData'), 'CampMind', 'Builds');

const hash = file => {const h=createHash('sha256'),fd=openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);try{let n;while((n=readSync(fd,buffer,0,buffer.length,null))>0)h.update(buffer.subarray(0,n));return h.digest('hex');}finally{closeSync(fd);}};
function verify(executable, expected) {
  if (!existsSync(executable) || hash(executable) !== expected.executableHash) throw new Error('Village executable changed before publication');
  const code = path.join(path.dirname(executable), 'GameAssembly.dll');
  if (!existsSync(code) || hash(code) !== expected.gameAssemblyHash) throw new Error('Village game code changed before publication');
  if (!existsSync(path.join(path.dirname(executable), 'CampMind_Data'))) throw new Error('Village package data is missing');
}

// Publish independent runtime files. A directory link into a user's build cache
// is not a release: another process may be unable to traverse it.
export function publishVillagePackage(root, executable, expected, builds = path.join(root, 'native/Builds')) {
  executable = path.resolve(executable);
  verify(executable, expected);
  mkdirSync(builds, { recursive: true });
  const destination = path.join(builds, 'Village-Verified-' + randomUUID());
  const temporary = destination + '.publishing';
  let prior;
  try{const m=JSON.parse(readFileSync(path.join(root,'native/Builds/village-current.json'),'utf8'));const p=path.resolve(m.executable);if(p.toLowerCase().startsWith(path.resolve(builds).toLowerCase()+path.sep)){verify(p,m);prior=path.dirname(p);}}catch{/* A prior release is optional. */}
  const sourceRoot=path.dirname(executable);
  function copyTree(source,target){
    mkdirSync(target,{recursive:true});
    for(const entry of readdirSync(source,{withFileTypes:true})){
      if(/(?:_BurstDebugInformation_DoNotShip|_BackUpThisFolder_ButDontShipItWithYourGame)$/.test(entry.name))continue;
      const from=path.join(source,entry.name),to=path.join(target,entry.name);
      if(entry.isDirectory()){copyTree(from,to);continue;}
      if(!entry.isFile())throw new Error('Release files must not be links');
      const previous=prior&&path.join(prior,path.relative(sourceRoot,from));
      if(previous&&existsSync(previous)&&statSync(previous).isFile()&&statSync(previous).size===statSync(from).size&&hash(previous)===hash(from)){
        try{linkSync(previous,to);continue;}catch{/* Other volumes/filesystems use an ordinary copy. */}
      }
      copyFileSync(from,to);
    }
  }
  try {
    copyTree(sourceRoot,temporary);
    verify(path.join(temporary, 'CampMind.exe'), expected);
    renameSync(temporary, destination);
    return path.join(destination, 'CampMind.exe');
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  }
}
