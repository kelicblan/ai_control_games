import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {advanceGameSteps,createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {baselinePolicy} from '../src/games/camp/ai/policy';
import {ensureAgency} from '../src/games/camp/npc/experience';
import type {GameState} from '../src/games/camp/simulation/types';
import {canonicalJson,stateDigest} from './export-unity-fixtures';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function buildRenderReplay(weather:'clear'|'storm',durationSeconds=90){
  if(!['clear','storm'].includes(weather)||!Number.isInteger(durationSeconds*10)||durationSeconds<1||durationSeconds>120)throw new Error('Invalid render replay capture');
  let state:GameState={...createGame({seed:17,mode:'rules'}),status:'playing'};
  ensureAgency(state).cognition=false;
  state=issueCommand(state,{type:'weather',weather});
  const frames=[];
  for(let tick=0;tick<=Math.round(durationSeconds*10);tick++){
    frames.push({at:tick/10,sha256:stateDigest(state),state});
    if(tick<Math.round(durationSeconds*10))state=advanceGameSteps(state,1,observation=>({...baselinePolicy(observation),latencyMs:0}));
  }
  return {version:1,kind:'typescript-authority-render-replay',seed:17,stepSeconds:.1,durationSeconds,weather,policy:'teacher-v3-zero-latency',note:'Full source states; no native rules, persistence or real LLM generation; renderer/bridge benchmarks remain separate',frames};
}
function sourceFingerprint(){
  const files:string[]=[];
  function walk(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.ts'))files.push(file);}}
  for(const dir of ['src/games/camp','packages/world-core/src','packages/npc-core/src'])walk(path.join(root,dir));
  files.push(fileURLToPath(import.meta.url),path.join(root,'scripts/export-unity-fixtures.ts'));
  const hash=createHash('sha256');for(const file of files.sort()){hash.update(path.relative(root,file).replaceAll('\\','/'));hash.update(readFileSync(file));}return hash.digest('hex');
}
export function writeRenderReplays(){
  const folder=path.join(root,'native/CampMind.Unity/Assets/CampMind/Content/Replay');mkdirSync(folder,{recursive:true});const sourceHash=sourceFingerprint(),manifestFile=path.join(folder,'manifest.json');
  if(existsSync(manifestFile))try{
    const prior=JSON.parse(readFileSync(manifestFile,'utf8'));
    if(prior.version===1&&prior.sourceHash===sourceHash&&prior.durationSeconds===90&&prior.files.length===2&&prior.files.every((f:{file:string;sha256:string})=>/^(clear|storm)\.bytes$/.test(f.file)&&existsSync(path.join(folder,f.file))&&sha(readFileSync(path.join(folder,f.file)))===f.sha256))return {...prior,reused:true};
  }catch{/* Rebuild generated fixtures when source or hashes changed. */}
  const files=[];
  for(const weather of ['clear','storm'] as const){const replay=buildRenderReplay(weather);const json=canonicalJson(replay);const compressed=gzipSync(json,{level:9});const file=weather+'.bytes';writeFileSync(path.join(folder,file),compressed);files.push({file,sha256:sha(compressed),decodedSha256:sha(json),frames:replay.frames.length,decodedBytes:Buffer.byteLength(json),compressedBytes:compressed.length});}
  const manifest={version:1,sourceHash,durationSeconds:90,stepSeconds:.1,policy:'teacher-v3-zero-latency',files};writeFileSync(manifestFile,JSON.stringify(manifest,null,2));return {...manifest,reused:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(writeRenderReplays()));
