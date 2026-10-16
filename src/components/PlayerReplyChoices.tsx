import { useEffect,useState } from 'react';
import type { GameCommand,GameState,NpcId } from '../games/camp/simulation/types';
import { dialogueSourceName } from '../integrations/models/runtime';
export function PlayerReplyChoices({game,npcId,onCommand}:{game:GameState;npcId:NpcId;onCommand:(command:GameCommand)=>void}){
 const sets=game.socialLife?.choices.filter(c=>c.npcId===npcId&&c.expiresAt>=game.elapsed)??[];
 const messages=game.socialLife?.messages.filter(m=>(m.from===npcId&&m.to.includes('player'))||(m.from==='player'&&m.to.includes(npcId))).slice(-12)??[];
 const [submitted,setSubmitted]=useState<string|null>(null);
 const ids=sets.map(s=>s.id).join(':');useEffect(()=>setSubmitted(null),[ids]);
 useEffect(()=>{if(!submitted)return;const timer=setTimeout(()=>setSubmitted(null),5000);return()=>clearTimeout(timer);},[submitted]);
 const appointment=game.socialLife?.appointments.find(a=>a.members.includes(npcId)&&a.members.includes('player')&&['travelling','waiting','talking'].includes(a.stage));
 return <section className="social-choices" aria-label="情境回复">
  <div className="social-transcript" role="log" aria-label="社会对话记录">{messages.map(m=><article className={`social-line ${m.from==='player'?'player':'companion'}`} key={m.id}>
   <div><strong>{m.from==='player'?'你':game.npcs.find(n=>n.id===m.from)?.name}</strong><small>{dialogueSourceName(m.source)}</small></div><p>{m.text}</p>
   {Object.values(m.replies).includes('pending')?<small>{m.to.includes('player')?'请选择回复':'等待对方回应'}</small>:null}
  </article>)}</div>
  {appointment?<p role="status">约定地点：寨里广场（50，110）。{appointment.stage==='talking'?'正在交谈':appointment.stage==='waiting'?'一方已到，请自行前往会合':'正在赴约，请自行前往会合'}。</p>:null}
  {sets.length?sets.map(set=><div key={set.id} data-choice-set={set.id}><h4>选择你的回应</h4>{set.options.map(option=><button className="social-choice" key={option.id} disabled={submitted===set.id||option.text==='内容审核中。'} onClick={()=>{setSubmitted(set.id);onCommand({type:'social-choice',setId:set.id,choiceId:option.id});}}>{option.text}</button>)}<button className="social-choice-refresh" disabled={submitted===set.id} onClick={()=>{setSubmitted(set.id);onCommand({type:'social-refresh',setId:set.id});}}>更换一批</button></div>):<p role="status">{messages.some(m=>m.to.includes('player')&&m.replies.player==='pending')?'正在准备安全回复选项…':'选择话题开始交流，或等待对方回应。'}</p>}
 </section>;
}
