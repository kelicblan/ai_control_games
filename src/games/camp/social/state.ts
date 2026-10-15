import type { GameState,NpcId } from '../simulation/types';
import type { PersonId,SocialDecision,SocialLife,SocietyMessage } from './types';
import { remember } from '../npc/experience';
export function ensureSocialLife(state:GameState):SocialLife {
 return state.socialLife??={version:1,sequence:0,messages:[],appointments:[],choices:[],nextInitiativeAt:state.elapsed+30,processed:[]};
}
export const activeAppointment=(state:GameState,id:PersonId)=>state.socialLife?.appointments.find(a=>a.members.includes(id)&&['travelling','waiting','talking'].includes(a.stage));
export function postMessage(state:GameState,from:PersonId,to:PersonId[],decision:SocialDecision,source:string,version:string,parent?:SocietyMessage):SocietyMessage {
 const social=ensureSocialLife(state),targets=[...new Set(to)].filter(id=>id!==from);
 const depth=parent?parent.depth+1:0;
 const terminal=['end','decline','defer','cancel'].includes(decision.intent)||depth>=6;
 const message:SocietyMessage={...decision,id:`society:${++social.sequence}`,from,to:targets,at:state.elapsed,source,version,replyTo:parent?.id,depth:Math.min(8,depth),replies:Object.fromEntries(targets.map(id=>[id,terminal?'replied':'pending']))};
 social.messages.push(message);
 // Keep pending turns until timeout, then bounded history. Never silently evict live turns.
 if(social.messages.length>100){
  const index=social.messages.findIndex(m=>!Object.values(m.replies).includes('pending'));
  if(index>=0)social.messages.splice(index,1);
  else{
   const expired=social.messages.shift()!;social.choices=social.choices.filter(c=>c.messageId!==expired.id);
   state.events.push({id:state.nextEventId++,time:state.elapsed,kind:'info',text:'待回应的消息过多，最早的一条已结束，可重新发起交流。'});
  }
 }
 for(const id of new Set([from,...targets]))if(id!=='player')remember(state,id,'dialogue',decision.text,from,[from,...targets],'heard','这是发言，尚不代表行动完成。',.5);
 return message;
}
export function respond(state:GameState,parentId:string,from:PersonId,decision:SocialDecision,source:string,version:string){
 const social=ensureSocialLife(state),parent=social.messages.find(m=>m.id===parentId);
 if(!parent||parent.replies[from]!=='pending')return;
 if(from!=='player'&&!state.npcs.find(n=>n.id===from)?.alive){parent.replies[from]='unavailable';return;}
 parent.replies[from]='replied';
 const effective={...decision};
 if(decision.intent==='accept'&&['invite','propose'].includes(parent.intent)){
  const location=decision.locationId??parent.locationId;
  if(!location){effective.intent='propose';effective.locationId='plaza';effective.text='我们到寨里广场聊，可以吗？';}
  else if(parent.locationId!==location){effective.intent='propose';effective.locationId=location;}
  else if(activeAppointment(state,from)||activeAppointment(state,parent.from)){
   effective.intent='defer';effective.text='我还有约，改天再聊吧。';
  }else{
   social.appointments=social.appointments.filter(a=>['travelling','waiting','talking'].includes(a.stage)).slice(-18);
   social.appointments.push({id:`appointment:${++social.sequence}`,members:[parent.from,from],locationId:location,stage:'travelling',createdAt:state.elapsed,dueAt:state.elapsed+180});
   effective.intent='end'; // Acknowledgement ends the remote exchange; the meeting starts a new one.
  }
 }
 if(decision.intent==='cancel'){
  const appointment=activeAppointment(state,from);if(appointment&&appointment.members.includes(parent.from)){appointment.stage='cancelled';appointment.reason='一方取消了约定';}
 }
 const message=postMessage(state,from,[parent.from],effective,effective.text!==decision.text?'safety':source,version,parent);
 social.choices=social.choices.filter(c=>c.messageId!==parentId);
 return message;
}
export function openPlayerConversation(state:GameState,npcId:NpcId){
 const s=ensureSocialLife(state);
 if(s.messages.some(m=>m.to.includes(npcId)&&m.from==='player'&&m.replies[npcId]==='pending'))return;
 postMessage(state,'player',[npcId],{text:'最近过得怎么样？',intent:'ask'},'player','authored');
}
