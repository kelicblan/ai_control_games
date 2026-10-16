import { parseAppraisal, appraisalPrompt } from '../../../../packages/npc-dialogue/src/appraisal-validation';
import { retrieveMemories, type Experience } from '../../../../packages/npc-core/src';
import { agencyPerson, remember } from './experience';
import { getCampProfile } from './profiles';
import type { GameState, Npc, NpcId } from '../simulation/types';
import type { Appraisal } from './agency-types';
import { villageFacts } from './world-context';
export interface AppraisalTicket { id:string;player:string;generation:string;branch:string;npcId:NpcId;at:number;
  through:number;settingsRevision:number;signature:string;evidence:Experience[];targets:string[];validFor?:number }
export const appraisalSignature=(npc:Npc,state?:GameState)=>JSON.stringify([npc.alive,Math.floor(npc.energy/10),Math.floor(npc.hunger/10),Math.floor(npc.health/10),Math.floor(npc.fear/10),Math.floor(npc.wetness/10),state?.weather,state?.world?.gateOpen,
  npc.mind?.concerns.map(c=>[c.id,c.status,c.denials]),npc.mind?.intent.kind]);
export function buildAppraisalContext(state:GameState,npc:Npc,stored:Experience[]=[]) {
  const p=agencyPerson(state,npc.id);
  const evidence=retrieveMemories([...new Map([...stored,...p.memory.recent].map(e=>[e.eventId,e])).values()],{
    npcId:npc.id,now:state.elapsed,query:npc.mind?.intent.reason??'疲劳休息分工承诺',limit:12});
  const targets=Object.keys(p.knownWork);
  return {evidence,targets,prompt:appraisalPrompt({name:npc.name,traits:getCampProfile(npc).traits,
    body:{health:npc.health,energy:npc.energy,hunger:npc.hunger,fear:npc.fear,wetness:npc.wetness},world:villageFacts(state,npc).slice(0,8),workload:state.social.people[npc.id].workload,
    concerns:npc.mind?.concerns.filter(c=>c.status!=='resolved'),emotions:npc.mind?.emotions,
    evidence:evidence.map(e=>({id:e.eventId,at:e.at,source:e.source,fact:e.fact.slice(0,180),interpretation:e.interpretation.slice(0,80)})),
    knownPeers:targets,previousSummary:p.appraisal?.summary??null})};
}
export function acceptAppraisal(state:GameState,ticket:AppraisalTicket,raw:string|null):Appraisal|null {
  const a=state.agency,npc=state.npcs.find(n=>n.id===ticket.npcId);
  const validFor=ticket.validFor??45;
  if(!Number.isFinite(validFor)||validFor<1||validFor>240||!a||!npc||!npc.alive||!a.cognition||a.settingsRevision!==ticket.settingsRevision||state.elapsed-ticket.at>validFor||appraisalSignature(npc,state)!==ticket.signature)return null;
  const p=agencyPerson(state,npc.id);p.appraisalStatus='fallback';
  if(raw===null)return null;
  let result:Appraisal;try{result=parseAppraisal(raw,ticket.evidence.map(e=>e.eventId),ticket.targets);}catch{return null;}
  p.appraisal=result;p.appraisalAt=state.elapsed;p.appraisalThrough=ticket.through;p.appraisalStatus='ready';
  // Only new, external experience evidence may adjust emotions, never the model's own generated description.
  const newEvidence=ticket.evidence.filter(e=>{
    const originalSequence=Number(e.eventId.match(/:(\d+)$/)?.[1]??e.sequence);
    return result.evidenceIds.includes(e.eventId)&&originalSequence>p.assessedThrough&&e.source!=='self'&&e.category!=='intent';
  });
  if(npc.mind&&newEvidence.length)for(const key of ['anger','resentment','stress']as const){
    const old=npc.mind.emotions[key],target=result.emotionAssessment[key];
    npc.mind.emotions[key]=Math.max(0,Math.min(1,old+Math.max(-.08,Math.min(.08,(target-old)*.2))));
  }
  p.assessedThrough=Math.max(p.assessedThrough,ticket.through);
  remember(state,npc.id,'intent',`当前理解：${result.summary}；目标：${result.goal}`,npc.id,[npc.id],'self','模型理解，不是新的客观事件。',.6);
  return result;
}
