import type { GameState,Npc } from '../simulation/types';
import { activeAppointment,postMessage } from './state';
import { moveWorldBody,worldCanTraverse } from '../world/navigation';
import { MOVE_SPEED,distance } from '../simulation/constants';
import { remember } from '../npc/experience';
import { threatNear } from '../world/ecology';
export const MEETING_POINT={x:50,y:110};
export function updateAppointments(state:GameState){
 for(const a of state.socialLife?.appointments??[]){
  if(!['travelling','waiting','talking'].includes(a.stage))continue;
  const people=a.members.filter(id=>id!=='player').map(id=>state.npcs.find(n=>n.id===id)!);
  const speaker=people.find(n=>n?.alive)?.id;
  const audience=a.members.filter(id=>id!==speaker);
  const emergency=people.some(n=>!n?.alive||n.health<35||n.energy<15||n.hunger>80||n.manualTarget||threatNear(state,n.position))||state.weather==='storm';
  const timedOut=state.elapsed>a.dueAt;
  if(emergency||timedOut){
   a.stage=emergency?'cancelled':'expired';a.reason=emergency?'需要先处理身体、安全或当前安排':'等候超时，约定结束';
   for(const n of people){if(!n)continue;delete n.worldRoute;n.decisionIn=0;if(n.action==='rest')n.action=null;remember(state,n.id,'social',a.reason,n.id,a.members,'experienced','约定未完成。',.6);}
   if(speaker)postMessage(state,speaker,audience,{text:emergency?'这次没法碰面了，改天再约。':'等了好一会没碰上，改天再聊吧。',intent:'end'},'safety','authored');continue;
  }
  const positions=a.members.map(id=>id==='player'?state.lord?.position:state.npcs.find(n=>n.id===id)?.position);
  const arrived=positions.every(p=>p&&distance(p,MEETING_POINT)<6)&&positions.every(p=>p&&worldCanTraverse(p,MEETING_POINT,state.seed,state.world?.gateOpen??true));
  if(arrived&&a.stage!=='talking'){
   a.stage='talking';a.startedAt=state.elapsed;
   a.meetingPositions=a.members.map((id,index)=>({id,...positions[index]!}));
   a.conversationStarted=true;
   if(speaker)postMessage(state,speaker,audience,{text:'我们碰面了，你最近有什么想聊的？',intent:'ask'},'safety','authored');
  }else if(!arrived&&a.stage==='talking'){a.stage='waiting';a.startedAt=undefined;}
  else if(!arrived)a.stage=positions.some(p=>p&&distance(p,MEETING_POINT)<6)?'waiting':'travelling';
  if(a.stage==='talking'&&a.startedAt!==undefined&&state.elapsed-a.startedAt>=20){
   const hasPending=state.socialLife!.messages.some(m=>m.at>=a.startedAt!&&a.members.includes(m.from)&&m.to.some(id=>a.members.includes(id))&&Object.values(m.replies).includes('pending'));
   if(hasPending&&state.elapsed-a.startedAt<60)continue;
   a.stage=hasPending?'expired':'completed';
   if(hasPending){
    a.reason='已到场，但等候回应超时';
    const ids=new Set<string>();
    for(const m of state.socialLife!.messages)if(m.at>=a.startedAt&&a.members.includes(m.from)&&m.to.some(id=>a.members.includes(id))){
     ids.add(m.id);for(const id of m.to)if(m.replies[id]==='pending')m.replies[id]='unavailable';
    }
    state.socialLife!.choices=state.socialLife!.choices.filter(c=>!ids.has(c.messageId));
   }
   for(const n of people){delete n.worldRoute;n.action=null;n.decisionIn=0;remember(state,n.id,'social',hasPending?'按照约定到广场见面，但没有等到回应。':'按照约定到广场见面交谈。',n.id,a.members,'experienced','亲身经历的会面。',.8);}
   if(!hasPending)for(const r of state.social.relationships)if(a.members.includes(r.from)&&a.members.includes(r.to))r.affinity=Math.min(100,r.affinity+2);
   if(speaker)postMessage(state,speaker,audience,{text:'今天先聊到这里，下次再见。',intent:'end'},'safety','authored');
  }
 }
}
export function advanceAppointment(state:GameState,npc:Npc,dt:number):boolean {
 const a=activeAppointment(state,npc.id);if(!a)return false;
 // Finish returning carried goods first; never erase an existing load or force a manual move.
 if(npc.inventory.food||npc.inventory.wood||npc.manualTarget||npc.action==='help'||npc.action==='eat')return false;
 const index=a.members.indexOf(npc.id),destination={x:MEETING_POINT.x+(index===0?-2:2),y:MEETING_POINT.y};
 npc.destination=destination;npc.action='rest';npc.decisionIn=1;
 if(distance(npc.position,destination)>.3){
  const moved=moveWorldBody(npc,destination,MOVE_SPEED,dt,state.npcs,state.seed,false,state.world?.gateOpen??true);
  npc.position=moved.position;
  npc.energy=Math.max(0,npc.energy-moved.distanceMoved*.23/MOVE_SPEED);
 }
 return true;
}
