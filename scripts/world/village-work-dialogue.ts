import type {VillageState} from '../../src/games/camp/village/domain/types';import type {VillageChannelLine} from './village-social-channel';import {digest} from '../../packages/action-runtime/src/json';import {distance} from '../../src/games/camp/village/systems/resources';
export interface WorkDialogueDraft{key:string;worldId:string;actorId:string;targetId:string;basisRef:string;replyTo:string|null;prompt:string}
const workKinds=new Set(['wildlife.warning','wildlife.harvested','node.depleted','item.crafted','exploration.completed','resources.deposited','resources.transferred','resource.transferred','agreement.fulfilled','actor.rescued','actor.healed']);
export function buildWorkDialogue(state:VillageState,attempted:(key:string)=>boolean,cooling:(actorId:string)=>boolean):WorkDialogueDraft|null{
 const alive=(id:string)=>{const a=state.actors[id];return !!a&&a.body.hp>0&&!a.body.downed&&!a.body.incapacitated;};
 const make=(actorId:string,targetId:string,basisRef:string,known:unknown,replyTo:string|null)=>{
  const actor=state.actors[actorId],key=`work:${digest({worldId:state.worldId,actorId,basisRef}).slice(0,28)}`;if(attempted(key))return null;
  const prompt='你是寨中人物，围绕本人已知的新工作情况与眼前同伴交流；回应时只能回应实际听到的发言。有值得传达的信息才speak=true，否则false。用简短自然中文，不新增事实、不替别人许诺、不把计划说成已完成。不要重复数据和编号。只返回给定JSON结构。\n数据：'+JSON.stringify({actorId,name:actor.name,targetId,targetName:state.actors[targetId].name,body:{hp:actor.body.hp,maxHp:actor.body.maxHp,energy:actor.body.energy,hunger:actor.body.hunger},goals:actor.personal.goals.filter(g=>g.progress<1).slice(0,3).map(g=>({kind:g.kind,priority:g.priority})),basisRef,known,replyTo});
  return {key,worldId:state.worldId,actorId,targetId,basisRef,replyTo,prompt};
 };
 for(const actor of Object.values(state.actors).filter(a=>a.id!==state.playerId&&alive(a.id)&&!cooling(a.id))){
  const peers=Object.values(actor.personal.knowledge.entities).filter(e=>e.kind==='ally'&&e.source==='observed'&&e.id!==state.playerId&&alive(e.id)&&distance(actor.position,state.actors[e.id].position)<=12);
  for(const heard of Object.values(actor.personal.knowledge.evidence).reverse())if(heard.kind==='actor.said'&&state.elapsed-heard.at<=90&&heard.facts.source==='village-model-speech'&&heard.facts.replyDepth===0&&heard.facts.recipientId===actor.id&&typeof heard.facts.speakerId==='string'&&peers.some(p=>p.id===heard.facts.speakerId)){
   const result=make(actor.id,heard.facts.speakerId,heard.eventId,{kind:heard.kind,text:heard.facts.text},String(heard.facts.publicationId));if(result)return result;
  }
 }
 for(const actor of Object.values(state.actors).filter(a=>a.id!==state.playerId&&alive(a.id)&&!cooling(a.id))){
  const peer=Object.values(actor.personal.knowledge.entities).find(e=>e.kind==='ally'&&e.source==='observed'&&e.id!==state.playerId&&alive(e.id)&&distance(actor.position,state.actors[e.id].position)<=12);if(!peer)continue;
  for(const event of [...state.events].reverse())if(workKinds.has(event.kind)&&state.elapsed-event.at<=90&&event.participants.includes(actor.id)&&actor.personal.knowledge.evidence[event.id]){
   const result=make(actor.id,peer.id,event.id,{kind:event.kind,at:event.at,facts:event.facts},null);if(result)return result;
  }
 }
 return null;
}
export function workDialogueSchema(d:WorkDialogueDraft){return {type:'object',additionalProperties:false,required:['speak','text','targetId','basisRef'],properties:{speak:{type:'boolean'},text:{type:'string',maxLength:80},targetId:{type:'string',enum:[d.targetId]},basisRef:{type:'string',enum:[d.basisRef]}}};}
export function validateWorkDialogue(state:VillageState,d:WorkDialogueDraft,raw:string):VillageChannelLine|null{
 let result:any;try{result=JSON.parse(raw);}catch{return null;}const actor=state.actors[d.actorId],target=state.actors[d.targetId];
 if(!result||result.speak!==true||Object.keys(result).some(k=>!['speak','text','targetId','basisRef'].includes(k))||typeof result.text!=='string'||!result.text.trim()||result.text.length>80||result.targetId!==d.targetId||result.basisRef!==d.basisRef||state.worldId!==d.worldId||!actor||!target||actor.body.hp<=0||target.body.hp<=0||actor.body.downed||target.body.downed||actor.body.incapacitated||target.body.incapacitated||distance(actor.position,target.position)>12||!actor.personal.knowledge.evidence[d.basisRef])return null;
 return {id:`${state.worldId}:speech:${digest(d.key).slice(0,24)}`,from:d.actorId,to:[d.targetId],text:result.text.trim(),at:state.elapsed,source:'village-model-speech'};
}
