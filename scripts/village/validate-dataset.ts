import{readFileSync,writeFileSync}from'node:fs';
import{ensure,digest}from'../../packages/action-runtime/src/json';
import{lifeEngineHash}from'../mlp_v4/engine-hash';
import{V4_SPEC}from'../../src/games/camp/village/ai/observation';
const reports=[];
for(const head of ['life','tactical']as const){
 const d=JSON.parse(readFileSync(`data/village/release/${head}/dataset.json`,'utf8'));
 ensure(d.format==='village-release-dataset-v1'&&d.head===head&&d.engineHash===lifeEngineHash(),'Stale or invalid executor dataset');
 ensure(d.spec.featureHash===V4_SPEC.featureHash&&d.spec.normalizerHash===V4_SPEC.normalizerHash,'Stale feature contract');
 const split=[d.trainSeeds,d.validationSeeds,d.testSeeds].flat();ensure(new Set(split).size===split.length&&split.length===44,'Seed leakage or missing split');
 const ids=new Set<string>(),families=new Map<string,Set<number>>();
 for(const r of d.rows){const id=`${r.episodeId}/${r.executionId}`;ensure(!ids.has(id),'Duplicate execution');ids.add(id);
  ensure(split.includes(r.seed)&&r.outcome.status==='completed'&&r.outcome.eventIds.length>0&&r.outcome.stateHash.length===64,'Unproven positive row');
  ensure(r.chosenIndex>=0&&r.chosenIndex<r.input.candidates.length&&r.input.knownLegalMask[r.chosenIndex],'Invalid chosen candidate');
  ensure(r.input.stateFeatures.length===V4_SPEC.heads[head].stateDim&&r.input.candidates.every((c:any)=>c.features.length===64),'Wrong input shape');
  const seeds=families.get(r.family)??new Set();seeds.add(r.seed);families.set(r.family,seeds);
 }
 ensure([...families.values()].every(s=>s.size===44),'A curriculum family is missing seed groups');
 reports.push({head,rows:d.rows.length,failedTrajectories:d.failures.length,uniqueExecutions:ids.size,coverage:d.coverage,familyCount:families.size,engineHash:d.engineHash,datasetHash:digest(d)});
}
writeFileSync('native/Artifacts/village/P5/dataset-validation.json',JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify(reports));
