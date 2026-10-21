import {readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{createHash}from'node:crypto';
import{prepareCurriculumEpisode}from'../../src/games/camp/village/scenarios/curriculum';
import{buildObservation,V4_SPEC}from'../../src/games/camp/village/ai/observation';
import{chooseReleaseLifeTeacher}from'../../src/games/camp/village/ai/release-life-teacher';
import{chooseTacticalTeacher}from'../../src/games/camp/village/ai/tactical-teacher';
import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';
import{submitCommand}from'../../src/games/camp/village/systems/commands';
import{advanceVillage}from'../../src/games/camp/village/systems/advance';
import{lifeEngineHash}from'../mlp_v4/engine-hash';
import{digest,ensure}from'../../packages/action-runtime/src/json';
import type{PolicyHead}from'../../packages/policy-runtime/src/types';
const outputRoot=process.env.CAMP_VILLAGE_DATA_ROOT??'data/village';
const head=process.argv[2]as PolicyHead;ensure(['life','tactical'].includes(head),'Specify life or tactical');
const splits=JSON.parse(readFileSync('config/village/dataset-splits.json','utf8')),curriculum=JSON.parse(readFileSync('config/village/scenario-curriculum.json','utf8'));
const smoke=process.argv.includes('--smoke'),seeds:number[]=smoke?[splits.trainSeeds[0],splits.trainSeeds[3]]:[...splits.trainSeeds,...splits.validationSeeds,...splits.testSeeds],families:string[]=curriculum[head],engineHash=lifeEngineHash(),rows:unknown[]=[],failures:unknown[]=[],coverage:Record<string,number>={};let ruleHash='';
for(const family of families){
 for(const seed of seeds){
  const state=prepareCurriculumEpisode(head,family,seed);ruleHash=state.ruleHash;
  const max=smoke?6:head==='life'?curriculum.maxLifeDecisions:curriculum.maxTacticalDecisions;
  for(let decision=0;decision<max;decision++){
   refreshKnowledge(state);const input=buildObservation(state,'worker',state.actors.worker.personal.knowledge,head),selected=head==='life'?chooseReleaseLifeTeacher(input):chooseTacticalTeacher(input),chosenIndex=input.candidates.findIndex(c=>c.id===selected);if(chosenIndex<0)break;
   const c=input.candidates[chosenIndex],receipt=submitCommand(state,{operationId:`decision-${decision}`,actorId:'worker',issuedAtTick:state.tick,action:c.action,parameters:c.parameters,readSet:c.readSet,source:'fallback',...(c.targetId?{targetId:c.targetId}:{})});
   if(!receipt.accepted){failures.push({seed,family,decision,input,chosenIndex,status:'rejected',reason:receipt.reason});break;}
   for(let tick=0;tick<curriculum.maxExecutionTicks&&['accepted','running'].includes(state.executions[receipt.executionId!].status);tick++)advanceVillage(state);
   const e=state.executions[receipt.executionId!],row={seed,family,episodeId:state.worldId,decision,executionId:e.id,source:'fallback',teacherId:`${head}-release-teacher-v1`,initialization:'declared-synthetic-scenario-with-physical-preflight',input,chosenIndex,outcome:{status:e.status,eventIds:e.eventIds,body:{...state.actors.worker.body},inventory:{...state.inventory},stateHash:digest(state)}};
   if(e.status!=='completed'){failures.push({...row,truncated:['accepted','running'].includes(e.status),reason:e.reason??null});break;}
   rows.push(row);coverage[c.action]=(coverage[c.action]??0)+1;
   if(head==='life'&&c.action==='WAIT')break;
   if(head==='life'&&family==='production'&&state.actors.worker.equipment)break;
   if(head==='life'&&family==='return'&&c.action==='DEPOSIT')break;
  }
  if(seeds.indexOf(seed)%4===3)console.log(JSON.stringify({head,family,seed,rows:rows.length,failures:failures.length}));
 }
 console.log(JSON.stringify({family,rows:rows.length,failures:failures.length,coverage}));
}
ensure(lifeEngineHash()===engineHash,'Authoritative source changed during collection');
const sourceHash=createHash('sha256').update(readFileSync(import.meta.filename)).update(readFileSync('src/games/camp/village/scenarios/curriculum.ts')).update(readFileSync('config/village/scenario-curriculum.json')).update(readFileSync('config/village/dataset-splits.json')).digest('hex');
const dataset={format:'village-release-dataset-v1',classification:'synthetic-executor-trajectories',head,ruleHash,engineHash,sourceHash,spec:V4_SPEC,seeds,trainSeeds:splits.trainSeeds,validationSeeds:splits.validationSeeds,testSeeds:splits.testSeeds,heldoutSeeds:splits.validationSeeds,coverage,failures,rows};
mkdirSync(`${outputRoot}/${smoke?'smoke':'release'}/${head}`,{recursive:true});writeFileSync(`${outputRoot}/${smoke?'smoke':'release'}/${head}/dataset.json`,JSON.stringify(dataset));
mkdirSync('native/Artifacts/village/P5',{recursive:true});writeFileSync(`native/Artifacts/village/P5/${head}-${smoke?'smoke':'collection'}.json`,JSON.stringify({head,ruleHash,engineHash,sourceHash,rows:rows.length,failures:failures.length,coverage},null,2));
console.log(JSON.stringify({complete:true,head,rows:rows.length,failures:failures.length,engineHash}));
