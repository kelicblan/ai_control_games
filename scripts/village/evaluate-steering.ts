import {readFileSync,writeFileSync} from 'node:fs';
import {createVillageState} from '../../src/games/camp/village/domain/state';import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {initializeEconomy,addResourceNode} from '../../src/games/camp/village/systems/resources';import {initializeCombat} from '../../src/games/camp/village/systems/combat';
import {refreshKnowledge} from '../../src/games/camp/village/systems/perception';import {buildObservation,V4_SPEC} from '../../src/games/camp/village/ai/observation';import {chooseReleaseLifeTeacher} from '../../src/games/camp/village/ai/release-life-teacher';
import {submitCommand} from '../../src/games/camp/village/systems/commands';import {advanceVillage} from '../../src/games/camp/village/systems/advance';import {loadV4Bundle} from '../mlp_v4/load-bundle';import {rankCandidates} from '../../packages/policy-runtime/src/candidate-mlp';import {ensure} from '../../packages/action-runtime/src/json';
const rules=selectWorldRules('village-v1','p4-social-content-v1'),model=loadV4Bundle('public/models/village-v4',rules.ruleHash,V4_SPEC).life,seeds=JSON.parse(readFileSync('config/village/dataset-splits.json','utf8')).testSeeds,results:any[]=[];
for(const source of ['teacher','mlp'])for(const seed of seeds)for(let variant=0;variant<4;variant++){
 const angle=variant*Math.PI/2,rotate=(x:number,y:number)=>({x:Math.cos(angle)*x-Math.sin(angle)*y,y:Math.sin(angle)*x+Math.cos(angle)*y});
 const s=createVillageState(rules,{id:'blocked-production-test',classification:'experiment',worldId:`blocked-test-${source}-${seed}-${variant}`,ruleVersion:rules.ruleVersion,seed,inventory:{wood:0,stone:0,rope:0,food:40},actors:[{archetypeId:'W002',instanceId:'worker',initial:{position:rotate(-3,0)}}]});
 initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:50});s.economy!.storePosition=rotate(-3,0);addResourceNode(s,rules,{id:'supply',resource:'rope',level:1,position:rotate(3,0)});s.paused=false;
 const tasks=[];let lateral=0,minClearance=Infinity;
 for(let decision=0;decision<2;decision++){
  refreshKnowledge(s);const input=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),selected=source==='mlp'?rankCandidates(model,input).selectedCandidateId:chooseReleaseLifeTeacher(input),c=input.candidates.find(c=>c.id===selected);ensure(c,'No blocked candidate');
  const receipt=submitCommand(s,{operationId:`blocked-${decision}`,actorId:'worker',action:c.action,parameters:c.parameters,readSet:c.readSet,source:source==='mlp'?'mlp':'fallback',...(c.targetId?{targetId:c.targetId}:{})});if(!receipt.accepted){tasks.push({action:c.action,status:'rejected'});break;}
  for(let i=0;i<1000&&['accepted','running'].includes(s.executions[receipt.executionId!].status);i++){advanceVillage(s);const p=s.actors.worker.position;lateral=Math.max(lateral,Math.abs(-p.x*Math.sin(angle)+p.y*Math.cos(angle)));minClearance=Math.min(minClearance,Math.hypot(p.x,p.y));}
  const e=s.executions[receipt.executionId!];tasks.push({action:c.action,status:e.status,reason:e.reason??null});
 }
 results.push({source,seed,variant,tasks,lateral,minClearance,depositedRope:s.inventory.rope??0});
}
const success=results.every(r=>r.tasks.length===2&&r.tasks.every((t:any)=>t.status==='completed')&&r.depositedRope>0&&r.lateral>.55&&r.minClearance>=.55-1e-8);const report={success,modelHash:model.manifest.sha256,seeds,results};writeFileSync('native/Artifacts/village/P7/blocked-evaluation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({success,episodes:results.length,mlpEpisodes:results.filter(r=>r.source==='mlp').length,failures:results.filter(r=>r.depositedRope<=0).length}));ensure(success,'Blocked production replay failed');
