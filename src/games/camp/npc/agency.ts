import { sampleIntent, type ActionOffer, type BehaviorDecision, type BehaviorIntent } from '../../../../packages/npc-core/src';
import type { GameState, Npc } from '../simulation/types';
import { agencyPerson, remember } from './experience';
import { getCampProfile } from './profiles';
export const protesting=(npc:Npc)=>!!npc.mind&&['refuse','recruit','strike'].includes(npc.mind.intent.kind);
export function chooseAgencyIntent(state:GameState,npc:Npc,decision:BehaviorDecision,offers:ActionOffer[],held:boolean):BehaviorDecision {
  if(!state.agency?.enabled||!npc.mind||held)return decision;
  const m=npc.mind,p=agencyPerson(state,npc.id),t=getCampProfile(npc).traits;
  const concern=m.concerns.filter(c=>c.status!=='resolved').sort((a,b)=>b.denials-a.denials||b.severity-a.severity)[0];
  if(!concern||npc.hunger>=76||npc.energy<8||npc.health<30)return decision;
  const pressure=Math.min(1,m.emotions.resentment*.55+m.emotions.anger*.3+concern.denials*.08+(1-npc.energy/100)*.15);
  if(concern.denials<1&&pressure<.45)return decision;
  const rest=offers.find(o=>o.kind==='rest')??offers.find(o=>o.kind==='idle');if(!rest)return decision;
  const group=state.agency.groups.find(g=>g.stage!=='ended'&&g.members.includes(npc.id));
  const legal:BehaviorIntent[]=['cooperate','endure','bargain','rest'];
  if(concern.denials>=2||m.emotions.resentment>.65)legal.push('refuse');
  if(concern.denials>=2&&t.courage>.45&&Object.keys(p.knownWork).length)legal.push('recruit');
  if(group)legal.push('strike');
  const scores:Partial<Record<BehaviorIntent,number>>={
    cooperate:1+t.diligence*2+npc.trust/100-pressure*5,endure:t.patience*2+t.diligence-pressure*2,
    bargain:.2+pressure*2+t.patience,rest:(1-npc.energy/100)*3-1,
    refuse:pressure*4+t.autonomy+t.impulsivity-t.patience,recruit:pressure*3+t.courage+t.empathy-.6,
    strike:pressure*4+t.empathy+(group?.stage==='striking'?1:0),
  };
  if(p.appraisal&&state.elapsed-p.appraisalAt<=45)for(const [key,v]of Object.entries(p.appraisal.preferences))scores[key as BehaviorIntent]=(scores[key as BehaviorIntent]??0)+Math.max(-.25,Math.min(.25,v!));
  const sampled=sampleIntent(m.randomState,scores,legal);m.randomState=sampled.randomAfter;p.decision={...sampled,source:'utility-v1',at:state.elapsed};
  const intent=sampled.selected,work=offers.find(o=>o.id===decision.actionId&&['work','aid','explore'].includes(o.kind))??offers.filter(o=>['work','aid','explore'].includes(o.kind)).sort((a,b)=>(b.baseline??0)-(a.baseline??0))[0];
  const selected=['cooperate','endure','evade'].includes(intent)?work??rest:rest;
  const effort=intent==='endure'?.85:intent==='cooperate'?1:intent==='bargain'?.2:0;
  const reason=`${({rest:'休息',food:'进食',fairness:'公平分工',safety:'安全'})[concern.kind]}诉求未解决，被拒绝${concern.denials}次；结合性格与经历选择${({cooperate:'合作',endure:'忍耐',bargain:'协商',evade:'降低投入',rest:'自主休息',refuse:'拒绝安排',recruit:'邀请同伴',strike:'一起停工'})[intent]}。`;
  m.intent={kind:intent,since:state.elapsed,until:state.elapsed+10,actionId:selected.id,reason};m.effort=effort;m.revision++;
  m.expression={kind:intent==='recruit'?'recruit':['refuse','strike'].includes(intent)?'refusal':intent==='bargain'?'bargain':'complaint',
    tone:m.emotions.anger>.45?'angry':'tired',concern:concern.kind,reason,allowDeception:false,revision:m.revision};
  remember(state,npc.id,'intent',reason,npc.id,[npc.id],'self','这是行动打算，实际结果尚未发生。',.7);
  return {actionId:selected.id,intent,expression:m.expression,reason,effort};
}
