import type { PolicyHead } from '../../../../../packages/policy-runtime/src/types';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { observePersonalEvent } from '../../../../../packages/social-core/src/knowledge';
import { proposalTermsHash } from '../../../../../packages/social-core/src/contracts';
import type { SocialProposal } from '../../../../../packages/social-core/src/types';
import { selectWorldRules } from '../config/load';
import { createVillageState } from '../domain/state';
import {createActor} from '../domain/actors';
import { initializeEconomy,addResourceNode } from '../systems/resources';
import { initializeCombat } from '../systems/combat';
import { advanceWaveSchedule } from '../systems/waves';
import { advanceVillage } from '../systems/advance';
import { submitCommand } from '../systems/commands';
import { activateSocialPlan } from '../social/adapter';
import type { VillageState } from '../domain/types';
export function executeSetup(state:VillageState,action:string,parameters:Record<string,string|number|null>,targetId?:string){
 const receipt=submitCommand(state,{operationId:`setup-${state.nextExecution}`,actorId:'worker',action,parameters,readSet:{},source:'scripted_test',...(targetId?{targetId}:{})});
 if(!receipt.accepted)throw new Error(`Scenario setup rejected: ${receipt.reason}`);
 for(let i=0;i<2500&&['accepted','running'].includes(state.executions[receipt.executionId!].status);i++)advanceVillage(state);
 if(state.executions[receipt.executionId!].status!=='completed')throw new Error('Scenario setup did not complete');
}
export function prepareCurriculumEpisode(head:PolicyHead,family:string,seed:number){
 const rules=selectWorldRules('village-v1','p4-social-content-v1');
 const archetypes=rules.tables.actors.filter(a=>a.kind!=='player'),archetype=archetypes[seed%archetypes.length];
 const tactical=head==='tactical',inventory=tactical||['craft','exploration','duty'].includes(family)?{wood:35,stone:5,rope:5,food:20}:{wood:13,stone:3,rope:4,food:10};
 if(family==='food')inventory.food=0;
 const position=tactical?{x:14+seed%3,y:1}:{x:0,y:0};
 const state=createVillageState(rules,{id:`${head}-${family}-${seed}`,worldId:`${head}-${family}-${seed}`,classification:'experiment',seed,actors:[{archetypeId:archetype.id,instanceId:'worker',initial:{position,personality:{risk_aversion:(seed%5)/4}}},...(tactical||['duty','companionship'].includes(family)?[{archetypeId:'W001',instanceId:'partner',initial:{position:tactical?{x:position.x,y:position.y+1.2}:{x:0,y:1}}}]:[]),...(family==='cooperation'?[{archetypeId:'W002',instanceId:'partner-2',initial:{position:{x:position.x,y:position.y-1.2}}}]:[])],inventory});
 if(family==='working-settlement')for(let i=0;i<8;i++){const id=`resident-${i}`;state.actors[id]=createActor('W001',id,{position:{x:3.2*Math.cos(i*Math.PI/4),y:3.2*Math.sin(i*Math.PI/4)}},rules.tables.actors);state.versions[`actor:${id}`]=0;}
 if(family==='working-settlement')state.inventory.food=35;
 if(family==='stock-replenishment')state.inventory={wood:35,stone:12,rope:10,food:30};
 if(family==='purposeful-idle')state.inventory={wood:200,stone:200,rope:200,food:100};
 if(family==='resource-search')state.inventory={wood:24,stone:4,rope:3,food:30};
 initializeEconomy(state,rules);state.paused=false;
 if(tactical||['repair','duty','companionship','working-settlement'].includes(family))initializeCombat(state,{center:{x:0,y:0},radius:10});
 if(!tactical)for(const[i,resource]of(['wood','stone','rope']as const).entries())addResourceNode(state,rules,{id:`node-${resource}`,resource,level:1+seed%4,position:{x:2+i,y:0}});
 if(seed%4===0)state.actors.worker.body.energy=35;
 if(family==='resource-search')for(const node of Object.values(state.economy!.nodes))node.remainingHp=0;
 if(family==='stock-replenishment'){state.actors.worker.body.energy=100;executeSetup(state,'CRAFT',{recipeId:'WPN005',recipientId:'worker',agreementId:null});executeSetup(state,'EQUIP',{itemId:Object.keys(state.economy!.items)[0]});}
 if(family==='food')state.actors.worker.body.hunger=80;
 if(family==='return'){state.actors.worker.position={x:8,y:0};state.actors.worker.carried={wood:10};}
 if(family==='repair')state.economy!.fence.hp=80;
 if(family==='exploration'){
  const e=appendEvent(state,'scenario.personal_goal',['worker'],{kind:'exploration'});state.actors.worker.personal.knowledge=observePersonalEvent('worker',e,state.actors.worker.personal.knowledge);
  state.actors.worker.personal.goals=[{id:'goal-exploration',actorId:'worker',kind:'exploration',priority:.9,progress:0,basisRefs:[e.id],revision:1,reconsiderOn:['exploration.completed']}];
 }
 if(family==='companionship'){const e=appendEvent(state,'scenario.personal_goal',['worker'],{kind:'affiliation'});state.actors.worker.personal.knowledge=observePersonalEvent('worker',e,state.actors.worker.personal.knowledge);state.actors.worker.personal.goals=[{id:'goal-affiliation',actorId:'worker',kind:'affiliation',priority:.9,progress:0,basisRefs:[e.id],revision:1,reconsiderOn:['social.visit_completed']}];}
 if(family==='duty'){
  const e=appendEvent(state,'scenario.guard_need',['worker','partner'],{reason:'voluntary-test-duty'});for(const id of ['worker','partner'])state.actors[id].personal.knowledge=observePersonalEvent(id,e,state.actors[id].personal.knowledge);
  state.social.issues.duty={id:'duty',participants:['worker','partner'],status:'agreed',revision:1,basisRefs:[e.id]};
  const institution={id:'duty-rule',version:1,kind:'guard-duty',issuerId:'worker',members:['worker','partner'],itemIds:[],effectiveAt:0,expiresAt:60,basisRefs:[e.id]};
  const p:SocialProposal={schemaVersion:1,id:'duty-proposal',actorId:'worker',issueId:'duty',version:1,parties:['worker','partner'],basisRefs:[e.id],speech:'Synthetic independently accepted duty fixture',readSet:{},terms:{steps:[{capability:'ACCEPT_REQUEST',version:'1',actorId:'worker',parameters:{institution}}],deadline:60}};
  state.social.proposals[p.id]=p;state.social.consents=p.parties.map(actorId=>({actorId,proposalId:p.id,proposalVersion:1,termsHash:proposalTermsHash(p),response:'accept',operationId:`fixture-consent-${actorId}`}));activateSocialPlan(state,p.id);advanceVillage(state);
 }
 if(tactical){
  state.actors.worker.body.energy=100;
  if(family==='ranged'){state.economy!.fence.hp=0;state.actors.worker.position={x:0,y:1};executeSetup(state,'CRAFT',{recipeId:'WPN005',recipientId:'worker',agreementId:null});const item=Object.keys(state.economy!.items)[0];executeSetup(state,'EQUIP',{itemId:item});executeSetup(state,'REPOSITION',{x:position.x,y:position.y});}
  state.elapsed=(rules.tables.waves[0].day-1)*720+480;state.tick=Math.round(state.elapsed*10);advanceWaveSchedule(state);
  state.economy!.fence.hp=family==='fence'?300:0;if(family==='fence'){state.economy!.fence.level=2;state.actors.worker.position={x:2,y:1};state.actors.partner.position={x:-2,y:1};}
  if(family==='rescue'){state.actors.partner.body.hp=0;state.actors.partner.body.downed=true;state.combat!.downedAt.partner=state.elapsed;}
  if(family==='cooperation'){const e=appendEvent(state,'scenario.relationship',['worker'],{kind:'declared-personal-history'});state.actors.worker.personal.knowledge=observePersonalEvent('worker',e,state.actors.worker.personal.knowledge);for(const [i,id]of ['partner','partner-2'].entries()){state.actors[id].body.hp=0;state.actors[id].body.downed=true;state.combat!.downedAt[id]=state.elapsed;state.actors.worker.personal.relations[id]={targetId:id,trust:(seed+i)%2?.8:.2,affinity:.5,reciprocity:.5,rivalry:0,authority:.5,basisRefs:[e.id]};}}
  if(family==='retreat')state.actors.worker.body.hp=Math.floor(state.actors.worker.body.maxHp*.2);
  if(family==='healing'){state.actors.worker.position={x:1,y:0};state.actors.partner.position={x:1.8,y:0};state.actors.partner.body.hp=20;}
 }
 return state;
}
