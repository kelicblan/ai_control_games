import{writeFileSync}from'node:fs';import{performance}from'node:perf_hooks';
import{createVillageState,restoreVillageState}from'../../src/games/camp/village/domain/state';import{selectWorldRules}from'../../src/games/camp/village/config/load';import{campaignScenario}from'../../src/games/camp/village/scenarios/campaign';
import{initializeEconomy}from'../../src/games/camp/village/systems/resources';import{initializeCombat}from'../../src/games/camp/village/systems/combat';import{advanceVillage}from'../../src/games/camp/village/systems/advance';import{advanceIdleVillage}from'../../src/games/camp/village/systems/catchup';import{compactVillageHistory}from'../../src/games/camp/village/domain/history';
import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';import{submitCommand}from'../../src/games/camp/village/systems/commands';import{buildObservation,V4_SPEC}from'../../src/games/camp/village/ai/observation';import{rankCandidates}from'../../packages/policy-runtime/src/candidate-mlp';import{loadV4Bundle}from'../mlp_v4/load-bundle';import{digest,ensure}from'../../packages/action-runtime/src/json';
import{villagePolicyPhase}from'../world/village-scheduling';import{villagePolicyFingerprint}from'../world/village-policy-context';import{maintainCombatSight}from'../world/village-perception';import{dueVillageWaves}from'../../src/games/camp/village/domain/clock';
const rules=selectWorldRules('village-v1','p4-social-content-v1'),models=loadV4Bundle('public/models/village-v4',rules.ruleHash,V4_SPEC);let s=createVillageState(rules,campaignScenario('mlp-long-run',1701,{x:0,y:0}));initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:10});s.paused=false;
const start=performance.now(),records=[],archives:unknown[]=[];let serial=0,mlpDecisions=0,failed=0;
for(let day=1;day<=175;day++){
 const end=day*7200;
 while(s.tick<end){
  const living=Object.values(s.actors).filter(a=>a.id!=='player'&&a.body.hp>0&&!a.body.incapacitated);
  if(!living.length){advanceIdleVillage(s,end-s.tick);break;}
  const noJobs=!Object.values(s.executions).some(e=>['accepted','running'].includes(e.status));
  if(noJobs&&!Object.values(s.combat!.enemies).some(e=>e.hp>0)&&living.every(a=>(s.policyMemo?.[a.id]?.nextAt??0)>s.elapsed)){
   const wake=Math.min(...living.map(a=>Math.floor(s.policyMemo![a.id].nextAt*10))),cycle=(Math.floor(s.tick/7200)+1)*7200,night=Math.floor(s.tick/7200)*7200+4800,wave=dueVillageWaves(s.elapsed,end*.1,rules,Object.keys(s.combat!.waves).map(Number))[0],boundary=Math.min(end,wake,cycle,...(night>s.tick?[night]:[]),...(wave?[Math.round(wave.atSeconds*10)-1]:[]));
   if(boundary>s.tick+1){advanceIdleVillage(s,boundary-s.tick);continue;}
  }
  if(s.tick%5===0){refreshKnowledge(s);maintainCombatSight(s);}for(const a of living){const phase=villagePolicyPhase(a.id);if(s.tick%5!==phase||Object.values(s.executions).some(e=>e.command.actorId===a.id&&['accepted','running'].includes(e.status)))continue;
   const head=Object.values(a.personal.knowledge.entities).some(e=>e.kind==='enemy'&&Number(e.values.hp)>0&&s.elapsed-e.at<=5)?'tactical':'life';if(head==='life'&&s.tick%20!==phase)continue;
   const fingerprint=villagePolicyFingerprint(s,a.id),memo=s.policyMemo?.[a.id];if(head==='life'&&memo?.fingerprint===fingerprint&&memo.nextAt>s.elapsed)continue;
   const input=buildObservation(s,a.id,a.personal.knowledge,head),d=rankCandidates(models[head],input),c=input.candidates.find(c=>c.id===d.selectedCandidateId);if(c){const r=submitCommand(s,{operationId:`long-${++serial}`,actorId:a.id,issuedAtTick:s.tick,action:c.action,parameters:c.parameters,readSet:c.readSet,source:'mlp',...(c.targetId?{targetId:c.targetId}:{})});(s.policyMemo??={})[a.id]={fingerprint,nextAt:s.elapsed+120};mlpDecisions++;if(!r.accepted)failed++;}
  }advanceVillage(s);if(s.tick%10===0)compactVillageHistory(s,b=>archives.push(b),256);
 }
 compactVillageHistory(s,b=>archives.push(b));const hash=digest(s);s=restoreVillageState(JSON.parse(JSON.stringify(s)),rules);ensure(digest(s)===hash,'Daily checkpoint changed world');records.push({day,alive:Object.values(s.actors).filter(a=>a.body.hp>0).length,waves:Object.keys(s.combat!.waves).length,food:s.inventory.food,fence:s.economy!.fence.level,events:s.events.length,operations:Object.keys(s.operations).length,stateHash:hash});
 if(day<=10||day%25===0)console.log(JSON.stringify(records.at(-1)));
}
ensure(Object.keys(s.combat!.waves).length===10,'Long run missed source waves');const report={classification:'flat-geometry-fixture-175-day-actual-mlp-no-player-intervention-no-llm-no-survival-guarantee',ruleHash:rules.ruleHash,models:models.release.models,mlpDecisions,rejectedCommands:failed,archiveSegments:archives.length,milliseconds:performance.now()-start,records};writeFileSync('native/Artifacts/village/P5/endurance-mlp.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,records:records.slice(-1)}));
