import { sampleIntent } from '../../../../packages/npc-core/src';
import type { GameState, NpcId, ActionId } from '../simulation/types';
import type { Collective } from './agency-types';
import { remember, rememberSpeech } from './experience';
import { getCampProfile } from './profiles';
import { ensureCampMind, recordMindEvent, requestMindReview } from './bridge';
import { distance } from '../simulation/constants';
import { worldCanTraverse } from '../world/navigation';
const concernNames={rest:'休息',food:'口粮',fairness:'公平分工',safety:'安全'};
function groupSpeech(state:GameState,g:Collective,speaker:NpcId|'player',text:string,audience:NpcId[],act?:'invite'|'accept-invitation'|'decline-invitation') {
  rememberSpeech(state,speaker,text,audience);
  let thread=state.social.threads.find(t=>t.id===g.threadId);
  if(!thread){thread={id:state.social.nextId++,kind:g.concern==='safety'?'weather':g.concern,initiator:g.initiator,participants:[...g.members],title:'共同诉求与交涉',prompt:'大家要求认真处理休息、口粮或分工。',createdAt:state.elapsed,expiresAt:state.elapsed+60,status:'open',revision:0,lines:[],choiceId:null,resolution:''};state.social.threads.push(thread);g.threadId=thread.id;if(state.social.threads.length>12)state.social.threads.shift();}
  thread.participants=[...new Set([...thread.participants,...audience])];thread.expiresAt=state.elapsed+60;
  const peers=audience.filter(id=>id!==speaker);
  thread.lines.push({id:state.social.nextLineId++,speaker,text:text.slice(0,400),at:state.elapsed,source:speaker==='player'?'player':'template',targetIds:speaker==='player'?audience:peers.length?peers:['player'],...(act?{act}:{})});
  if(thread.lines.length>16)thread.lines.shift();thread.revision++;state.social.revision++;
  if(speaker!=='player'){const n=state.npcs.find(n=>n.id===speaker)!;n.speech=text;n.speechUntil=state.elapsed+6;}
}
export function updateCollectives(state:GameState) {
  const a=state.agency;if(!a?.enabled)return;
  for(const n of state.npcs){
    if(!n.alive||!n.mind||!['recruit','strike','bargain','refuse'].includes(n.mind.intent.kind)||a.groups.some(g=>g.stage!=='ended'&&g.members.includes(n.id)))continue;
    if(a.groups.filter(g=>g.stage!=='ended').length>=3)continue;
    const c=n.mind.concerns.find(c=>c.status!=='resolved');
    const g:Collective={id:a.nextGroupId++,concern:c?.kind??'fairness',initiator:n.id,members:[n.id],invited:[],declined:[],stage:n.mind.intent.kind==='recruit'?'recruiting':n.mind.intent.kind==='bargain'?'negotiating':'striking',createdAt:state.elapsed,updatedAt:state.elapsed,round:1};
    a.groups.push(g);if(a.groups.length>12){const ended=a.groups.findIndex(g=>g.stage==='ended');if(ended>=0)a.groups.splice(ended,1);}
    remember(state,n.id,'social',`发起${concernNames[g.concern]}诉求，准备${g.stage==='recruiting'?'找同伴商量':'与领主交涉'}。`,n.id,[n.id],'experienced','',.9);
    groupSpeech(state,g,n.id,'这安排得谈清楚，我不能一直这样干。',[n.id]);
  }
  for(const g of a.groups){
    if(g.stage==='ended')continue;
    g.members=g.members.filter(id=>state.npcs.find(n=>n.id===id)?.alive);
    if(!g.members.length){g.stage='ended';continue;}
    if(!g.members.includes(g.initiator))g.initiator=g.members[0];
    if(g.promise){
      if(g.promise.kind==='fairness'&&state.elapsed-g.promise.startedAt>=30)for(const id of g.members)
        if(state.social.people[id].workload<(g.promise.workloads[id]??0)&&!g.promise.fulfilled.includes(id))g.promise.fulfilled.push(id);
      if(g.members.every(id=>g.promise!.fulfilled.includes(id))){g.stage='ended';g.updatedAt=state.elapsed;for(const id of g.members){const n=state.npcs.find(n=>n.id===id)!;recordMindEvent(state,n,'promise_kept','集体交涉的安排已实际兑现。',g.concern);if(n.mind){n.mind.intent.until=state.elapsed;n.mind.intent.kind='cooperate';}requestMindReview(state,n);}continue;}
      if(state.elapsed>g.promise.dueAt){for(const id of g.members)if(!g.promise.fulfilled.includes(id))recordMindEvent(state,state.npcs.find(n=>n.id===id)!,'promise_broken','集体交涉的承诺到期仍未兑现。',g.concern);g.stage='striking';delete g.promise;g.updatedAt=state.elapsed;}
    }else if(state.elapsed-g.createdAt>10){
      g.members=g.members.filter(id=>{const n=state.npcs.find(n=>n.id===id)!;const unresolved=n.mind?.concerns.some(c=>c.status!=='resolved'&&c.kind===g.concern);return unresolved||['recruit','strike','refuse'].includes(n.mind?.intent.kind??'');});
      if(!g.members.length)g.stage='ended';else if(g.members.length>1&&g.members.some(id=>state.npcs.find(n=>n.id===id)?.mind?.intent.kind==='strike'))g.stage='striking';
    }
  }
}
export function invitePeer(state:GameState,g:Collective,targetId:NpcId):boolean {
  const from=state.npcs.find(n=>n.id===g.initiator),to=state.npcs.find(n=>n.id===targetId);
  if(!from?.alive||!to?.alive||g.stage==='ended'||from.id===to.id||g.invited.includes(to.id)||g.members.includes(to.id)
    ||distance(from.position,to.position)>6||!worldCanTraverse(from.position,to.position,state.seed,state.world?.gateOpen??true))return false;
  g.invited.push(to.id);g.updatedAt=state.elapsed;
  groupSpeech(state,g,from.id,`我想争取合理的安排，${to.name}，你愿意一起谈吗？`,[from.id,to.id],'invite');
  const m=ensureCampMind(to,state.elapsed),t=getCampProfile(to).traits;
  const affinity=(state.social.relationships.find(r=>r.from===to.id&&r.to===from.id)?.affinity??50)/100;
  const join=-1.5+m.emotions.resentment*2+m.emotions.anger+(1-to.energy/100)*.8+t.empathy+affinity*.7+t.courage*.3-t.diligence*.6-to.trust/100*.4;
  const sample=sampleIntent(m.randomState,{strike:join,cooperate:.6-t.empathy*.4},['strike','cooperate']);m.randomState=sample.randomAfter;
  if(sample.selected==='strike'&&!state.agency!.groups.some(other=>other.id!==g.id&&other.stage!=='ended'&&other.members.includes(to.id))){
    g.members.push(to.id);recordMindEvent(state,to,'peer_protest',`${from.name}当面邀请共同交涉，我决定支持。`,g.concern,from.id);
    m.intent={kind:'strike',since:state.elapsed,until:state.elapsed+10,actionId:'rest',reason:'听取邀请后，结合自身经历决定一起交涉。'};
    m.revision++;m.expression={kind:'refusal',tone:'irritated',concern:g.concern,reason:m.intent.reason,allowDeception:false,revision:m.revision};requestMindReview(state,to);
    groupSpeech(state,g,to.id,'我也有自己的难处，这次我愿意一起谈。',[from.id,to.id],'accept-invitation');
  }else{g.declined.push(to.id);groupSpeech(state,g,to.id,t.empathy>.6?'我理解你，但想先劝双方把话说清楚。':'我先不加入，你们的诉求我听到了。',[from.id,to.id],'decline-invitation');}
  return true;
}
export function replyCollective(state:GameState,id:number,choice:'listen'|'rest'|'food'|'fairness'|'refuse') {
  const g=state.agency?.groups.find(g=>g.id===id&&g.stage!=='ended');if(!g)return;
  if(g.promise&&g.promise.kind===choice)return;
  groupSpeech(state,g,'player',({listen:'我愿意听你们的共同诉求。',rest:'让你们先实际休息恢复。',food:'会给你们安排口粮，以实际吃到为准。',fairness:'这轮先减少你们的劳动，观察后续负担。',refuse:'目前不调整安排，继续工作。'})[choice],g.members);
  g.updatedAt=state.elapsed;
  if(choice==='listen'){if(!g.promise)g.stage='negotiating';return;}
  if(choice==='refuse'){delete g.promise;for(const id of g.members){const n=state.npcs.find(n=>n.id===id)!;recordMindEvent(state,n,'request_denied','领主明确拒绝这轮集体诉求。',g.concern);requestMindReview(state,n);}g.stage='striking';return;}
  if(g.promise)return;
  g.stage='easing';g.promise={kind:choice,startedAt:state.elapsed,dueAt:state.elapsed+60,fulfilled:[],workloads:Object.fromEntries(g.members.map(id=>[id,state.social.people[id].workload]))};
  for(const id of g.members){const n=state.npcs.find(n=>n.id===id)!;recordMindEvent(state,n,'request_granted','领主答应调整安排，仍需实际兑现。',g.concern);
    n.command=choice==='food'?'eat':'rest';requestMindReview(state,n);}
}
export function collectiveActionCompleted(state:GameState,id:NpcId,action:ActionId){
  const n=state.npcs.find(n=>n.id===id)!;
  for(const g of state.agency?.groups??[])if(g.stage!=='ended'&&g.members.includes(id)&&g.promise&&!g.promise.fulfilled.includes(id)){
    if(g.promise.kind==='rest'&&action==='rest'&&n.energy>=70||g.promise.kind==='food'&&action==='eat'&&n.hunger<=35)g.promise.fulfilled.push(id);
  }
}
