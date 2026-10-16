import { validExperience, validMemory } from '../../../../packages/npc-core/src';
import { parseAppraisal, APPRAISAL_INTENTS } from '../../../../packages/npc-dialogue/src/appraisal-validation';
import { NPC_IDS, ACTIONS, type NpcId } from '../simulation/types';
import type { AgencyState } from './agency-types';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,required:string[],optional:string[]=[]):v is Record<string,unknown>=>obj(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const num=(v:unknown,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const integer=(v:unknown,min=0)=>num(v)&&Number.isSafeInteger(v)&&(v as number)>=min;
const ids=(v:unknown):v is NpcId[]=>Array.isArray(v)&&v.length<=NPC_IDS.length&&new Set(v).size===v.length&&v.every(id=>NPC_IDS.includes(id));
const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
export function validAgency(value:unknown,elapsed:number):value is AgencyState {
  try{return validate(value,elapsed);}catch{return false;}
}
function validate(value:unknown,elapsed:number):value is AgencyState {
  if(!keys(value,['version','enabled','cognition','modelId','settingsRevision','sequence','pending','people','groups','nextGroupId'],['legacyImported','modelBinding']))return false;
  const a=value as unknown as AgencyState;
  if(a.version!==1||a.modelBinding!==undefined&&a.modelBinding!=='dialogue'||a.legacyImported!==undefined&&typeof a.legacyImported!=='boolean'||typeof a.enabled!=='boolean'||typeof a.cognition!=='boolean'||!(a.modelId===null||str(a.modelId,100))
    ||!integer(a.settingsRevision)||!integer(a.sequence)||!Array.isArray(a.pending)||a.pending.length>4096
    ||!a.pending.every((e,i)=>validExperience(e)&&e.sequence<=a.sequence&&e.at<=elapsed&&(!i||e.sequence>a.pending[i-1].sequence))
    ||!obj(a.people)||Object.keys(a.people).some(id=>!NPC_IDS.includes(id as NpcId))||!Array.isArray(a.groups)||a.groups.length>12||!integer(a.nextGroupId,1))return false;
  const groupIds=new Set<number>();
  for(const g of a.groups){
    if(!keys(g,['id','concern','initiator','members','invited','declined','stage','createdAt','updatedAt','round'],['threadId','promise'])
      ||!integer(g.id,1)||g.id>=a.nextGroupId||groupIds.has(g.id)||!['rest','food','fairness','safety'].includes(g.concern)
      ||!NPC_IDS.includes(g.initiator)||![g.members,g.invited,g.declined].every(ids)
      ||!['forming','recruiting','negotiating','striking','easing','ended'].includes(g.stage)||!num(g.createdAt,elapsed)||!num(g.updatedAt,elapsed)||g.updatedAt<g.createdAt||!integer(g.round,1)
      ||g.threadId!==undefined&&!integer(g.threadId,1))return false;
    groupIds.add(g.id);
    if(g.promise&&(!keys(g.promise,['kind','dueAt','startedAt','fulfilled','workloads'])||!['rest','food','fairness'].includes(g.promise.kind)
      ||!num(g.promise.startedAt,elapsed)||!num(g.promise.dueAt)||g.promise.dueAt<g.promise.startedAt||!ids(g.promise.fulfilled)||!obj(g.promise.workloads)
      ||Object.entries(g.promise.workloads).some(([id,n])=>!NPC_IDS.includes(id as NpcId)||!num(n))))return false;
  }
  if(a.groups.filter(g=>g.stage!=='ended').length>3)return false;
  for(const [id,p]of Object.entries(a.people)){
    if(!keys(p,['memory','lastSpeech','lastTasks','lastAction','body','knownWork','appraisal','appraisalAt','appraisalThrough','assessedThrough','nextAppraisalAt','appraisalStatus','decision','invitation','nextInviteAt'])
      ||!validMemory(p.memory)||p.memory.watermark>a.sequence||!p.memory.recent.every(e=>e.npcId===id&&e.at<=elapsed)
      ||!str(p.lastSpeech,400)||!integer(p.lastTasks)||!(p.lastAction===null||ACTIONS.includes(p.lastAction as typeof ACTIONS[number]))
      ||!Array.isArray(p.body)||p.body.length!==3||!p.body.every(n=>num(n,100))||!obj(p.knownWork)
      ||Object.entries(p.knownWork).some(([peer,v])=>!NPC_IDS.includes(peer as NpcId)||!keys(v,['workload','at'])||!num(v.workload)||!num(v.at,elapsed))
      ||![p.appraisalAt,p.nextAppraisalAt,p.nextInviteAt].every(v=>num(v))||p.appraisalAt>elapsed
      ||![p.appraisalThrough,p.assessedThrough].every(v=>integer(v)&&v<=a.sequence)||!['idle','pending','ready','fallback'].includes(p.appraisalStatus))return false;
    if(p.appraisal)parseAppraisal(JSON.stringify(p.appraisal),p.appraisal.evidenceIds,NPC_IDS);
    if(p.invitation&&(!keys(p.invitation,['groupId','targetId','since','origin'])||!groupIds.has(p.invitation.groupId)||!NPC_IDS.includes(p.invitation.targetId)||!num(p.invitation.since,elapsed)
      ||!keys(p.invitation.origin,['x','y'])||!Number.isFinite(p.invitation.origin.x)||!Number.isFinite(p.invitation.origin.y)))return false;
    if(p.decision){const d=p.decision;
      if(!keys(d,['source','candidates','selected','randomBefore','randomAfter','at'])||d.source!=='utility-v1'||!APPRAISAL_INTENTS.includes(d.selected)||!num(d.at,elapsed)
        ||!integer(d.randomBefore)||d.randomBefore>0xffffffff||!integer(d.randomAfter)||d.randomAfter>0xffffffff||!Array.isArray(d.candidates)||!d.candidates.length||d.candidates.length>8
        ||!d.candidates.every(c=>keys(c,['intent','probability'])&&APPRAISAL_INTENTS.includes(c.intent)&&num(c.probability,1))
        ||Math.abs(d.candidates.reduce((s,c)=>s+c.probability,0)-1)>1e-6)return false;
    }
  }
  return true;
}
