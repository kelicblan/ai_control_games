import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {Observation,Candidate} from './engine';
export function animalEngineHash(){const hash=createHash('sha256');for(const file of ['./engine.ts','./model.ts','./population.ts','./tide.ts','./authority.ts','./validation.ts','../../../../config/animals/ecology-v2.json','../../../../packages/world-core/src/steering.ts'])hash.update(readFileSync(fileURLToPath(new URL(file,import.meta.url)),'utf8').replace(/\r\n/g,'\n'));return hash.digest('hex');}
export function loadAnimalModel(folder=process.env.CAMP_ANIMAL_MODEL_DIR??fileURLToPath(new URL('../../../../public/models/animal-v1/',import.meta.url))){
 const raw=readFileSync(folder+'/weights.json');const weights=JSON.parse(raw.toString()),report=JSON.parse(readFileSync(folder+'/training-report.json','utf8'));const hash=createHash('sha256').update(raw).digest('hex');
 if(weights.format!=='animal-shared-trunk-two-head-v1'||report.engineHash!==animalEngineHash()||report.weightHash!==hash||report.kind!=='real-numpy-fp32-adam-imitation-training'||report.steps<1||report.initialWeightHash===hash)throw new Error('Animal model provenance mismatch');
 const sizes=[36,64,32,2],p=weights.parameters as number[][][];
 const arrays=weights.parameters as any[];for(let i=0;i<3;i++){if(arrays[i*2].length!==sizes[i]||arrays[i*2].some((row:number[])=>row.length!==sizes[i+1]||row.some(v=>!Number.isFinite(v)))||arrays[i*2+1].length!==sizes[i+1]||arrays[i*2+1].some((v:number)=>!Number.isFinite(v)))throw new Error('Animal weights invalid');}
 function scores(o:Observation){return o.candidates.map(c=>{let a=[...o.state,...c.features];for(let layer=0;layer<3;layer++){const w=p[layer*2],b=arrays[layer*2+1] as number[];const next=b.map((v,j)=>{let sum=v;for(let i=0;i<a.length;i++)sum+=a[i]*w[i][j];return layer<2?Math.max(0,sum):sum;});a=next;}return a[o.head==='combat'?1:0];});}
 return {hash,report,scores,decide(o:Observation):Candidate{const values=scores(o);return o.candidates[values.indexOf(Math.max(...values))];}};
}
