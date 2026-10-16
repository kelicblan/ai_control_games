import { NPC_IDS } from '../simulation/types';
import { SOCIAL_INTENTS,type SocialDecision,type SocialLife } from './types';
export function parseSocialDecision(raw:string):SocialDecision {
 const value=JSON.parse(raw);
 if(!value||typeof value.text!=='string'||value.text.trim().length<2||value.text.length>140||/[<>\n\ufffd]/.test(value.text)||/JSON|schema|intent|locationId|输出格式|只输出|提示词|作为.{0,5}模型/i.test(value.text)
  ||!SOCIAL_INTENTS.includes(value.intent)||value.locationId!==undefined&&value.locationId!=='plaza'
  ||Object.keys(value).some(k=>!['text','intent','locationId'].includes(k)))throw new Error('社会意图无效');
 return value;
}
export const decisionSchema={type:'object',additionalProperties:false,required:['text','intent'],properties:{text:{type:'string',minLength:2,maxLength:140},intent:{type:'string',enum:[...SOCIAL_INTENTS]},locationId:{type:'string',enum:['plaza']}}};
export function validSocialLife(value:unknown):value is SocialLife {
 try{
  const s=value as SocialLife,person=(id:unknown)=>id==='player'||NPC_IDS.includes(id as typeof NPC_IDS[number]);
  if(!s||s.version!==1||!Number.isSafeInteger(s.sequence)||s.sequence<0||!Number.isFinite(s.nextInitiativeAt)||s.nextInitiativeAt<0)return false;
  if(!Array.isArray(s.messages)||s.messages.length>100||!Array.isArray(s.appointments)||s.appointments.length>20||!Array.isArray(s.choices)||s.choices.length>20||!Array.isArray(s.processed)||s.processed.length>200)return false;
  if(s.previousChoices&&!(typeof s.previousChoices.messageId==='string'&&Number.isFinite(s.previousChoices.refreshedAt)&&Array.isArray(s.previousChoices.texts)&&s.previousChoices.texts.length<=5&&s.previousChoices.texts.every(t=>typeof t==='string'&&t.length<=140)))return false;
  if(!s.messages.every(m=>typeof m.id==='string'&&person(m.from)&&Array.isArray(m.to)&&m.to.length<=10&&m.to.every(person)&&!m.to.includes(m.from)&&typeof m.text==='string'&&m.text.length<=140&&SOCIAL_INTENTS.includes(m.intent)&&Number.isFinite(m.at)&&Number.isInteger(m.depth)&&m.depth>=0&&m.depth<=8&&m.replies&&Object.entries(m.replies).every(([id,status])=>person(id)&&['pending','replied','unavailable'].includes(status!))))return false;
  if(!s.appointments.every(a=>typeof a.id==='string'&&a.locationId==='plaza'&&a.members.length===2&&new Set(a.members).size===2&&a.members.every(person)&&['travelling','waiting','talking','completed','cancelled','expired'].includes(a.stage)&&Number.isFinite(a.createdAt)&&Number.isFinite(a.dueAt)))return false;
  return s.choices.every(c=>typeof c.id==='string'&&typeof c.messageId==='string'&&NPC_IDS.includes(c.npcId)&&Number.isFinite(c.expiresAt)&&c.options.length<=5&&c.options.every(o=>{parseSocialDecision(JSON.stringify({text:o.text,intent:o.intent,...(o.locationId?{locationId:o.locationId}:{})}));return typeof o.id==='string';}));
 }catch{return false;}
}
