import{readFileSync,writeFileSync}from'node:fs';
import{NativeAppraisal}from'../world/native-appraisal';
import{MiniMindAppraisal}from'../world/minimind-appraisal';
import{prepareCurriculumEpisode}from'../../src/games/camp/village/scenarios/curriculum';
import{buildSocialContext,requestSocialProposal,respondSocialProposal}from'../../src/games/camp/village/social/context';
import{ensureIssue}from'../../packages/social-core/src/issues';
import{activateSocialPlan}from'../../src/games/camp/village/social/adapter';
import{advanceVillage}from'../../src/games/camp/village/systems/advance';
import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';
import{buildObservation,V4_SPEC}from'../../src/games/camp/village/ai/observation';
import{chooseReleaseLifeTeacher}from'../../src/games/camp/village/ai/release-life-teacher';
import{loadV4Bundle}from'../mlp_v4/load-bundle';
import{rankCandidates}from'../../packages/policy-runtime/src/candidate-mlp';
import{submitCommand}from'../../src/games/camp/village/systems/commands';
import{selectWorldRules}from'../../src/games/camp/village/config/load';
import{appendEvent}from'../../packages/action-runtime/src/runtime';
import{observePersonalEvent}from'../../packages/social-core/src/knowledge';
const rules=selectWorldRules('village-v1','p4-social-content-v1'),models=loadV4Bundle('public/models/village-v4',rules.ruleHash,V4_SPEC),native=new NativeAppraisal(process.cwd()),fallback=new MiniMindAppraisal(process.cwd()),provider=process.argv[2]??'qwen3.5-2b';
const catalog=JSON.parse(readFileSync('gamesoul/models.json','utf8')),reports=[],calls:Array<{seed:number;source:string;milliseconds:number;raw:string}>=[];
try{for(const seed of [9001,9002,9003,9004]){
 const base=prepareCurriculumEpisode('life','companionship',seed);base.actors.worker.body.energy=20;refreshKnowledge(base);
 const event=appendEvent(base,'self.observed',['worker'],{energy:20,need:'rest'});base.actors.worker.personal.knowledge=observePersonalEvent('worker',event,base.actors.worker.personal.knowledge);
 const issue=ensureIssue(base.social.issues,{actorId:'worker',reason:'low-energy',participants:['worker','partner'],basisRefs:[event.id]});
 const social=structuredClone(base),context=buildSocialContext('worker',social.social.issues[issue.id],social.actors.worker.personal.knowledge,social);
 const generate=async(prompt:string,schema:Record<string,unknown>,signal:AbortSignal)=>{const start=Date.now();let raw:string,source=provider;try{raw=provider==='minimind3'?await fallback.generateJSON(prompt,schema,signal):await native.generateJSON(provider,prompt,schema,signal);}catch{source='minimind3-fallback';raw=await fallback.generateJSON(prompt,schema,signal);}calls.push({seed,source,milliseconds:Date.now()-start,raw});return raw;};
 let proposal:Awaited<ReturnType<typeof requestSocialProposal>>|null=null;const responses=[];let error:string|null=null;
 try{proposal=await requestSocialProposal(social,context,generate);if(proposal.ok){social.social.proposals[proposal.proposal.id]=proposal.proposal;for(const actor of proposal.proposal.parties)responses.push(await respondSocialProposal(social,actor,proposal.proposal,generate));if(responses.every(r=>r.accepted&&r.consent?.response==='accept'))activateSocialPlan(social,proposal.proposal.id);}}catch(e){error=String(e);}
 for(const mode of ['rules','mlp+text','mlp+social']){
  const state=mode==='mlp+social'?structuredClone(social):structuredClone(base);let serial=0;
  for(let tick=0;tick<200;tick++){
   if(state.tick%20===0){refreshKnowledge(state);for(const actor of ['worker','partner']){
    if(Object.values(state.executions).some(e=>e.command.actorId===actor&&['accepted','running'].includes(e.status)))continue;
    const input=buildObservation(state,actor,state.actors[actor].personal.knowledge,'life'),id=mode==='rules'?chooseReleaseLifeTeacher(input):rankCandidates(models.life,input).selectedCandidateId,c=input.candidates.find(c=>c.id===id);if(c)submitCommand(state,{operationId:`ablation-${++serial}`,actorId:actor,issuedAtTick:state.tick,action:c.action,parameters:c.parameters,readSet:c.readSet,source:mode==='rules'?'scripted_test':'mlp',...(c.targetId?{targetId:c.targetId}:{})});
   }}advanceVillage(state);
  }
  reports.push({seed,mode,error,proposal:proposal?.ok?proposal.proposal:null,responses,energy:state.actors.worker.body.energy,agreements:state.social.agreements,completed:Object.values(state.executions).filter(e=>e.status==='completed').map(e=>({id:e.id,action:e.command.action,planId:e.command.planId??null})),relations:state.actors.worker.personal.relations});
 }
 console.log(JSON.stringify({seed,provider,calls:calls.filter(c=>c.seed===seed).length,error}));
}}finally{native.dispose();fallback.dispose();}
const report={classification:'real-local-llm-three-arm-paired-small-sample',seeds:[9001,9002,9003,9004],provider,providerHash:catalog.find((m:any)=>m.id===provider)?.sha256??null,ruleHash:rules.ruleHash,models:models.release.models,calls,reports,limitations:['Four paired seeds are a plumbing and causality probe, not a claim of statistically established social improvement.','Text-only arm receives the same generated text without authoritative proposal execution. Independent consent can decline or remain quiet.']};
writeFileSync('native/Artifacts/village/P5/real-social-ablation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({reports:reports.length,calls:calls.length}));
