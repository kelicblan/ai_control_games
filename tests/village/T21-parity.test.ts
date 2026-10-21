import{expect,it}from'vitest';import{readFileSync,mkdtempSync,cpSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';import{createHash}from'node:crypto';
import{loadV4Bundle}from'../../scripts/mlp_v4/load-bundle';import{V4_SPEC}from'../../src/games/camp/village/ai/observation';import{selectWorldRules}from'../../src/games/camp/village/config/load';import{decodeCandidateModel,rankCandidates}from'../../packages/policy-runtime/src/candidate-mlp';
const rule=()=>selectWorldRules('village-v1','p4-social-content-v1');
const modelRoot=process.env.CAMP_VILLAGE_MODEL_DIR??'public/models/village-v4';
it('loads both genuine heads and resolves exact trained-score ties by stable candidate identity',()=>{
 const bundle=loadV4Bundle(modelRoot,rule().ruleHash,V4_SPEC);for(const head of ['life','tactical']as const){expect(bundle[head].manifest.kind).toBe('trained');const d=JSON.parse(readFileSync(`data/village/beast-tide-v2/wildlife/${head}/dataset-forest-compatible.json`,'utf8')),input=structuredClone(d.rows[0].input),candidate=input.candidates[0];input.candidates=[{...candidate,id:'z'},{...candidate,id:'a'}];input.knownLegalMask=[true,true];expect(rankCandidates(bundle[head],input).selectedCandidateId).toBe('a');}
});
it('rejects a corrupted second head as a complete bundle and refuses NaN weights even with a matching byte hash',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'village-bundle-'));try{cpSync(modelRoot,dir,{recursive:true});const file=path.join(dir,'tactical/weights.bin'),bytes=readFileSync(file);bytes[0]^=1;writeFileSync(file,bytes);expect(()=>loadV4Bundle(dir,rule().ruleHash,V4_SPEC)).toThrow();
 const manifest=JSON.parse(readFileSync(path.join(modelRoot,'life/manifest.json'),'utf8')),nan=readFileSync(path.join(modelRoot,'life/weights.bin'));nan.writeFloatLE(Number.NaN,0);manifest.sha256=createHash('sha256').update(nan).digest('hex');expect(()=>decodeCandidateModel(manifest,nan,V4_SPEC)).toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
