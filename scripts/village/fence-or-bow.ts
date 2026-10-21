import{writeFileSync}from'node:fs';
import{createVillageState,restoreVillageState}from'../../src/games/camp/village/domain/state';
import{selectWorldRules}from'../../src/games/camp/village/config/load';
import{initializeEconomy}from'../../src/games/camp/village/systems/resources';
import{initializeCombat}from'../../src/games/camp/village/systems/combat';
import{submitCommand}from'../../src/games/camp/village/systems/commands';
import{advanceVillage}from'../../src/games/camp/village/systems/advance';
import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';
import{buildObservation,V4_SPEC}from'../../src/games/camp/village/ai/observation';
import{rankCandidates}from'../../packages/policy-runtime/src/candidate-mlp';
import{loadV4Bundle}from'../mlp_v4/load-bundle';
import{digest,ensure}from'../../packages/action-runtime/src/json';
const rules=selectWorldRules('village-v1','p4-social-content-v1'),models=loadV4Bundle('public/models/village-v4',rules.ruleHash,V4_SPEC),results=[];
for(const choice of ['fence','bow']){
 const s=createVillageState(rules,{id:`fence-or-bow-${choice}`,worldId:`fence-or-bow-${choice}`,classification:'fixture',seed:64138,actors:[{archetypeId:'H001',instanceId:'guard',initial:{position:{x:-1,y:1}}},{archetypeId:'H002',instanceId:'worker',initial:{position:{x:1,y:1}}},{archetypeId:'H005',instanceId:'ranger',initial:{position:{x:0,y:1.5}}}],inventory:{wood:35,stone:5,rope:5,food:30}});initializeEconomy(s,rules);initializeCombat(s,{center:{x:0,y:0},radius:10});s.economy!.fence={level:2,hp:300};s.paused=false;
 // Declared pre-wave fixture, with source stats, source costs and physical work durations.
 s.elapsed=(rules.tables.waves[0].day-1)*720+480-100;s.tick=Math.round(s.elapsed*10);
 let serial=0;function command(actorId:string,action:string,parameters:Record<string,string|number|null>,targetId?:string){const receipt=submitCommand(s,{operationId:`slice-${++serial}`,actorId,issuedAtTick:s.tick,action,parameters,readSet:{},source:'scripted_test',...(targetId?{targetId}:{})});ensure(receipt.accepted,receipt.reason??'Slice command rejected');for(let n=0;n<3000&&['accepted','running'].includes(s.executions[receipt.executionId!].status);n++)advanceVillage(s);ensure(s.executions[receipt.executionId!].status==='completed','Physical slice job failed');return receipt.executionId!;}
 const first=command('player',choice==='fence'?'UPGRADE_FENCE':'CRAFT',{recipeId:choice==='fence'?'3':'WPN005',recipientId:'player',agreementId:null});
 if(choice==='bow'){const item=Object.keys(s.economy!.items)[0];ensure(item,'Craft did not create an item');command('player','TRANSFER',{itemId:item},'ranger');}
 const afterChoice={inventory:{...s.inventory},fence:{...s.economy!.fence},elapsed:s.elapsed};let decisions=0;
 for(let n=0;n<3000;n++){
  if(s.tick%5===0){refreshKnowledge(s);for(const a of Object.values(s.actors)){
   if(a.body.hp<=0||a.body.incapacitated||Object.values(s.executions).some(e=>e.command.actorId===a.id&&['accepted','running'].includes(e.status)))continue;
   const head=Object.values(a.personal.knowledge.entities).some(e=>e.kind==='enemy'&&Number(e.values.hp)>0&&s.elapsed-e.at<=5)?'tactical':'life';if(head==='life'&&s.tick%20!==0)continue;
   const input=buildObservation(s,a.id,a.personal.knowledge,head),d=rankCandidates(models[head],input),c=input.candidates.find(c=>c.id===d.selectedCandidateId);if(c){submitCommand(s,{operationId:`mlp-${++serial}`,actorId:a.id,issuedAtTick:s.tick,action:c.action,parameters:c.parameters,readSet:c.readSet,source:'mlp',...(c.targetId?{targetId:c.targetId}:{})});decisions++;}
  }}advanceVillage(s);
  if(Object.keys(s.combat!.waves).length&&(!Object.values(s.combat!.enemies).some(e=>e.hp>0)||!Object.values(s.actors).some(a=>a.body.hp>0)))break;
 }
 restoreVillageState(s,rules);
 const equipped=Object.values(s.executions).some(e=>e.command.actorId==='ranger'&&e.command.action==='EQUIP'&&e.command.source==='mlp'&&e.status==='completed');
 if(choice==='bow')ensure(equipped,'Ranger never chose to equip the physically delivered bow');
 results.push({choice,firstExecution:first,afterChoice,mlpDecisions:decisions,rangerEquippedByMlp:equipped,waves:Object.keys(s.combat!.waves).length,killed:Object.values(s.combat!.enemies).filter(e=>e.hp===0).length,survivors:Object.values(s.actors).filter(a=>a.body.hp>0).length,elapsed:s.elapsed,fence:s.economy!.fence,stateHash:digest(s),models:models.release.models});
}
writeFileSync('native/Artifacts/village/P3/fence-or-bow.json',JSON.stringify({classification:'physical-executor-two-branch-pre-wave-fixture',ruleHash:rules.ruleHash,results},null,2));console.log(JSON.stringify(results));
