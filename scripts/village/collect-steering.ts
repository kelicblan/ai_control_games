import {readFileSync,writeFileSync} from 'node:fs';
import {createVillageState} from '../../src/games/camp/village/domain/state';import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {initializeEconomy,addResourceNode} from '../../src/games/camp/village/systems/resources';import {initializeCombat} from '../../src/games/camp/village/systems/combat';
import {refreshKnowledge} from '../../src/games/camp/village/systems/perception';import {buildObservation} from '../../src/games/camp/village/ai/observation';import {chooseReleaseLifeTeacher} from '../../src/games/camp/village/ai/release-life-teacher';
import {submitCommand} from '../../src/games/camp/village/systems/commands';import {advanceVillage} from '../../src/games/camp/village/systems/advance';import {lifeEngineHash} from '../mlp_v4/engine-hash';import {ensure,digest} from '../../packages/action-runtime/src/json';
const file='data/village/release/life/dataset.json',data=JSON.parse(readFileSync(file,'utf8'));ensure(data.engineHash===lifeEngineHash(),'Collect base first');const rules=selectWorldRules('village-v1','p4-social-content-v1'),rows:any[]=[],failures:any[]=[];
for(const seed of data.seeds)for(let variant=0;variant<4;variant++){
 const angle=variant*Math.PI/2,rotate=(x:number,y:number)=>({x:Math.cos(angle)*x-Math.sin(angle)*y,y:Math.sin(angle)*x+Math.cos(angle)*y});
 const s=createVillageState(rules,{id:'blocked-production',classification:'experiment',worldId:`blocked-${seed}-${variant}`,ruleVersion:rules.ruleVersion,seed,inventory:{wood:0,stone:0,rope:0,food:40},actors:[{archetypeId:'W002',instanceId:'worker',initial:{position:rotate(-3,0)}}]});
 initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:50});s.economy!.storePosition=rotate(-3,0);addResourceNode(s,rules,{id:'supply',resource:'rope',level:1,position:rotate(3,0)});s.paused=false;
 for(let decision=0;decision<2;decision++){
  refreshKnowledge(s);const input=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),selected=chooseReleaseLifeTeacher(input),chosenIndex=input.candidates.findIndex(c=>c.id===selected);ensure(chosenIndex>=0,'Missing blocked choice');const c=input.candidates[chosenIndex];
  const receipt=submitCommand(s,{operationId:`blocked-${decision}`,actorId:'worker',action:c.action,parameters:c.parameters,readSet:c.readSet,source:'fallback',...(c.targetId?{targetId:c.targetId}:{})});ensure(receipt.accepted,'Blocked lesson rejected');
  let lateral=0;for(let i=0;i<1000&&['accepted','running'].includes(s.executions[receipt.executionId!].status);i++){advanceVillage(s);const p=s.actors.worker.position;lateral=Math.max(lateral,Math.abs(-p.x*Math.sin(angle)+p.y*Math.cos(angle)));}
  const e=s.executions[receipt.executionId!],row={seed,family:'blocked-production',episodeId:s.worldId,decision,executionId:e.id,source:'fallback',teacherId:'life-release-teacher-v1',input,chosenIndex,outcome:{status:e.status,stateHash:digest(s),maximumLateralDetour:lateral,eventIds:e.eventIds}};
  if(e.status==='completed')rows.push(row);else failures.push({...row,reason:e.reason});
 }
}
data.rows.push(...rows);data.failures.push(...failures);data.steering={format:'physical-peer-detour-v1',rows:rows.length,failures:failures.length};data.sourceHash=digest({base:data.sourceHash,collector:readFileSync(import.meta.filename,'utf8')});writeFileSync(file,JSON.stringify(data));writeFileSync('native/Artifacts/village/P7/blocked-collection.json',JSON.stringify({success:failures.length===0,rows:rows.length,failures,detours:rows.map(r=>r.outcome.maximumLateralDetour)},null,2));console.log(JSON.stringify({rows:rows.length,failures:failures.length}));ensure(failures.length===0,'Blocked production lessons failed');
