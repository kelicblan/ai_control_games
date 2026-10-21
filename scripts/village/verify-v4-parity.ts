import{readFileSync,writeFileSync}from'node:fs';
import{spawnSync}from'node:child_process';
import{loadPolicyBundle}from'../mlp_v4/load-bundle';
import{V4_SPEC}from'../../src/games/camp/village/ai/observation';
import{ensure}from'../../packages/action-runtime/src/json';
const root=process.argv[2]??'public/models/village-v4',reports=[];
for(const head of ['life','tactical']as const){
 const d=JSON.parse(readFileSync(`data/village/release/${head}/dataset.json`,'utf8')),model=loadPolicyBundle(`${root}/${head}`,d.ruleHash,V4_SPEC,head),bytes=readFileSync(`${root}/${head}/weights.bin`),weights=Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4)),checks=[];
 for(const row of d.rows.filter((r:any)=>d.testSeeds.includes(r.seed)).filter((_:any,i:number)=>i%17===0).slice(0,12)){
  const input=[...row.input.stateFeatures,...row.input.candidates[row.chosenIndex].features];
  const p=spawnSync('python',['scripts/village/forward_reference.py'],{input:JSON.stringify({input,weights,layers:model.manifest.layers}),encoding:'utf8',windowsHide:true});ensure(p.status===0,p.stderr);
  const reference=JSON.parse(p.stdout).score,actual=model.score(input),error=Math.abs(reference-actual);checks.push({executionId:row.executionId,reference,actual,error});
 }
 ensure(checks.length>0,'No independent parity inputs');reports.push({head,modelHash:model.manifest.sha256,maxAbsoluteError:Math.max(...checks.map(c=>c.error)),checks});
}
const passed=reports.every(r=>r.maxAbsoluteError<1e-4);writeFileSync(`native/Artifacts/village/P5/${passed?'parity':'parity-failed-v1'}.json`,JSON.stringify({passed,reports},null,2));console.log(JSON.stringify(reports.map(r=>({head:r.head,maxAbsoluteError:r.maxAbsoluteError,modelHash:r.modelHash}))));ensure(passed,'Python/TS FP32 parity failed');
