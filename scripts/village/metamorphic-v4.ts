import{readFileSync,writeFileSync}from'node:fs';
import{loadV4Bundle}from'../mlp_v4/load-bundle';
import{V4_SPEC}from'../../src/games/camp/village/ai/observation';
import{rankCandidates}from'../../packages/policy-runtime/src/candidate-mlp';
import{selectWorldRules}from'../../src/games/camp/village/config/load';
import{ensure,digest}from'../../packages/action-runtime/src/json';
import contract from'../../src/games/camp/village/ai/contract.json';
const rules=selectWorldRules('village-v1','p4-social-content-v1'),models=loadV4Bundle('public/models/village-v4',rules.ruleHash,V4_SPEC),checks=[],relations=[];
for(const head of ['life','tactical']as const){
 const data=JSON.parse(readFileSync(`data/village/release/${head}/dataset.json`,'utf8'));
 for(const row of data.rows.filter((r:any)=>data.testSeeds.includes(r.seed)).filter((_:any,i:number)=>i%13===0).slice(0,48)){
  const input=row.input,baseline=rankCandidates(models[head],input),renamed=structuredClone(input);renamed.actorId='renamed-person';for(const c of renamed.candidates){c.actorId='renamed-person';if(c.targetId)c.targetId='renamed-'+c.targetId;}
  const scores=(value:Record<string,number>)=>digest(Object.fromEntries(Object.entries(value)));
  const rename=rankCandidates(models[head],renamed);ensure(scores(baseline.rawScores)===scores(rename.rawScores)&&baseline.selectedCandidateId===rename.selectedCandidateId,'Identity leaked into policy ranking');
  const reverse=structuredClone(input);reverse.candidates.reverse();reverse.knownLegalMask.reverse();const reordered=rankCandidates(models[head],reverse);ensure(scores(reordered.rawScores)===scores(baseline.rawScores)&&reordered.selectedCandidateId===baseline.selectedCandidateId,'Candidate ordering changed selection');
  checks.push({head,seed:row.seed,family:row.family,rename:true,reorder:true});
 }
 const pair=data.rows.find((r:any)=>data.testSeeds.includes(r.seed)&&r.family==='cooperation'&&r.input.candidates.filter((c:any)=>c.action==='RESCUE').length>=2);
 if(pair){const input=pair.input,trust=32+contract.candidateNumeric.findIndex(f=>f.id==='trust_target');const ranked=[];for(const swap of [false,true]){const changed=structuredClone(input);let i=0;for(const c of changed.candidates)if(c.action==='RESCUE'){c.features[trust]=((i++%2===0)!==swap)?.9:.1;}const d=rankCandidates(models[head],changed);ranked.push({swap,selected:d.selectedCandidateId,scores:d.rawScores});}relations.push({head,seed:pair.seed,classification:'paired-known-relationship-intervention-only',changedChoice:ranked[0].selected!==ranked[1].selected,ranked});}
}
writeFileSync('native/Artifacts/village/P5/metamorphic.json',JSON.stringify({passed:true,checks,relations,models:models.release.models,limitations:['Relationship score sensitivity alone is not evidence of LLM social causation.']},null,2));console.log(JSON.stringify({checks:checks.length,relations}));
