import{readFileSync,writeFileSync}from'node:fs';
import{performance}from'node:perf_hooks';
import{prepareCurriculumEpisode}from'../../src/games/camp/village/scenarios/curriculum';
import{buildObservation,V4_SPEC}from'../../src/games/camp/village/ai/observation';
import{chooseReleaseLifeTeacher}from'../../src/games/camp/village/ai/release-life-teacher';
import{chooseTacticalTeacher}from'../../src/games/camp/village/ai/tactical-teacher';
import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';
import{submitCommand}from'../../src/games/camp/village/systems/commands';
import{advanceVillage}from'../../src/games/camp/village/systems/advance';
import{rankCandidates}from'../../packages/policy-runtime/src/candidate-mlp';
import{loadV4Bundle}from'../mlp_v4/load-bundle';
import{selectWorldRules}from'../../src/games/camp/village/config/load';
import{ensure}from'../../packages/action-runtime/src/json';
const rules=selectWorldRules('village-v1','p4-social-content-v1'),bundle=loadV4Bundle('public/models/village-v4',rules.ruleHash,V4_SPEC),splits=JSON.parse(readFileSync('config/village/dataset-splits.json','utf8')),curriculum=JSON.parse(readFileSync('config/village/scenario-curriculum.json','utf8'));
const head=process.argv[2]as'life'|'tactical';ensure(['life','tactical'].includes(head),'Specify head');
const protocol=JSON.parse(readFileSync('config/village/physical-rollout-protocol-v2.json','utf8'));
const results:Array<{head:string;family:string;seed:number;mode:string;completed:number;attempts:number;production:boolean;productionAt20:boolean;alive:boolean;hp:number;elapsed:number;decisions:unknown[]}>=[],latencies:number[]=[];
for(const family of curriculum[head])for(const seed of splits.testSeeds)for(const mode of ['teacher','mlp']){
 const state=prepareCurriculumEpisode(head,family,seed),decisions=[];let productionAt20=false;
 for(let index=0;index<(head==='life'?protocol.lifeMaximumDecisions:protocol.tacticalMaximumDecisions);index++){
  refreshKnowledge(state);const input=buildObservation(state,'worker',state.actors.worker.personal.knowledge,head),start=performance.now(),decision=mode==='mlp'?rankCandidates(bundle[head],input):null;
  if(decision)latencies.push(performance.now()-start);
  const selected=decision?.selectedCandidateId??(head==='life'?chooseReleaseLifeTeacher(input):chooseTacticalTeacher(input)),candidate=input.candidates.find(c=>c.id===selected);if(!candidate)break;
  const receipt=submitCommand(state,{operationId:`evaluation-${index}`,actorId:'worker',issuedAtTick:state.tick,action:candidate.action,parameters:candidate.parameters,readSet:candidate.readSet,source:mode==='mlp'?'mlp':'scripted_test',...(candidate.targetId?{targetId:candidate.targetId}:{})});
  if(!receipt.accepted){decisions.push({action:candidate.action,status:'rejected',reason:receipt.reason});break;}
  for(let tick=0;tick<curriculum.maxExecutionTicks&&['accepted','running'].includes(state.executions[receipt.executionId!].status);tick++)advanceVillage(state);
  const execution=state.executions[receipt.executionId!];decisions.push({action:candidate.action,status:execution.status,executionId:execution.id,reason:execution.reason??null});
  if(index<20&&Object.values(state.economy!.items).some(i=>i.recipeId==='WPN005'))productionAt20=true;
  if(execution.status!=='completed'||candidate.action==='WAIT')break;
  if(head==='life'&&family==='production'&&state.actors.worker.equipment)break;
  if(head==='life'&&family==='return'&&candidate.action==='DEPOSIT')break;
 }
 const completed=decisions.filter(d=>d.status==='completed').length;
 const production=Object.values(state.economy!.items).some(i=>i.recipeId==='WPN005');
 results.push({head,family,seed,mode,completed,attempts:decisions.length,production,productionAt20,alive:state.actors.worker.body.hp>0,hp:state.actors.worker.body.hp,elapsed:state.elapsed,decisions});
 console.log(JSON.stringify({head,family,seed,mode,completed,production}));
}
function wilson(k:number,n:number){if(!n)return[0,1];const z=1.96,p=k/n,c=(p+z*z/(2*n))/(1+z*z/n),h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n);return[c-h,c+h];}
latencies.sort((a,b)=>a-b);const summary=['teacher','mlp'].map(mode=>{const rows=results.filter(r=>r.mode===mode),production=rows.filter(r=>r.family==='production'),k=production.filter(r=>r.production).length;return{mode,episodes:rows.length,completedActions:rows.reduce((n,r)=>n+r.completed,0),attemptedActions:rows.reduce((n,r)=>n+r.attempts,0),production:{n:production.length,success:k,rate:production.length?k/production.length:null,wilson95:wilson(k,production.length)},survivedEpisodes:rows.filter(r=>r.alive).length};});
const report={ruleHash:rules.ruleHash,modelHash:bundle[head].manifest.sha256,seeds:splits.testSeeds,protocol,classification:'frozen-test-physical-executor-rollouts-not-teacher-accuracy',latency:{n:latencies.length,p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)]},summary,results};
const suffix=process.argv[3]??'';ensure(/^(-[a-z0-9]+)?$/.test(suffix),'Invalid evaluation output version');writeFileSync(`native/Artifacts/village/P5/${head}${suffix}-physical-evaluation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(summary));
