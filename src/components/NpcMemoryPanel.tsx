import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { publication } from '../integrations/world/publication';
import type { GameState, Npc } from '../games/camp/simulation/types';
import type { Experience } from '../../packages/npc-core/src';
import { ensurePlayerSession } from '../integrations/world/session';
import { ClockText } from './ui';
import { npcStatusText } from './npcStatusText';
type MemoryPage={items:Experience[];cursor:number|null;generation:string|null;branch:string|null};
export function NpcMemoryPanel({game,npc}:{game:GameState;npc:Npc}) {
  const person=game.agency?.people[npc.id];
  const [page,setPage]=useState<MemoryPage|null>(null),[history,setHistory]=useState<Experience[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  const publicationKey=useSyncExternalStore(publication.subscribe,publication.getSnapshot,publication.getSnapshot);
  const historyKey=useRef(publicationKey);
  useEffect(()=>{request.current?.abort();setPage(null);setHistory([]);historyKey.current=publicationKey;setError('');setBusy(false);return()=>request.current?.abort();},[npc.id,Boolean(game.agency),publicationKey]);
  const load=async()=>{
    if(busy)return;setBusy(true);setError('');const controller=new AbortController();request.current?.abort();request.current=controller;
    try{
      await ensurePlayerSession();
      const query=new URLSearchParams({npc:npc.id});
      if(page?.cursor&&page.generation&&page.branch){query.set('before',String(page.cursor));query.set('generation',page.generation);query.set('branch',page.branch);}
      const response=await fetch(`/game-api/memories?${query}`,{credentials:'same-origin',headers:{'X-Camp-Tab':'npc-memory-panel'},signal:controller.signal});
      const result=await response.json();if(!response.ok)throw new Error(result.error??'读取记忆失败');
      if(!controller.signal.aborted&&publication.getSnapshot()===publicationKey){setPage(result);setHistory(old=>[...new Map([...old,...result.items].map((e:Experience)=>[e.eventId,e])).values()]);}
    }catch(err){if(!controller.signal.aborted){setError(err instanceof Error?err.message:'读取记忆失败');setPage(null);setHistory([]);}}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const recent=person?.memory.recent.slice(-8).reverse()??[];
  const items=historyKey.current!==publicationKey?[]:history.length?history:recent;
  return <section className="npc-memory-panel" aria-label={`${npc.name}的持续记忆`}>
    <div className="npc-current-body"><span>饥饿 {Math.round(npc.hunger)}</span><span>精力 {Math.round(npc.energy)}</span><span>健康 {Math.round(npc.health)}</span></div>
    <p className="npc-cognition-state">{person?.appraisalStatus==='pending'?'正在结合经历理解处境…':person?.appraisalStatus==='ready'?'大模型认知已接纳':'当前由心智策略理解状态'}{person?.decision?' · 概率意图策略':''}</p>
    {person?.appraisal?<div className="npc-appraisal"><strong>{game.elapsed-person.appraisalAt>45?'此前的状态理解':'当前状态理解'}</strong><p>{npcStatusText(person.appraisal.summary)}</p><small>目标：{npcStatusText(person.appraisal.goal)} · 基于 {person.appraisal.evidenceIds.length} 条经历</small></div>:null}
    <details><summary>持续记忆与个人看法 <span>{person?.memory.recent.length??0} 条近期记录</span></summary>
      <p className="npc-memory-note">发言与个人看法有独立标记；听到一句话不代表所述事情已经发生。</p>
      <ol className="npc-memory-list">{items.map(e=><li key={e.eventId}><div><span>{e.category==='self'?'自言自语':e.category==='intent'?'个人理解与打算':e.source==='heard'?'听到的发言':'亲历记录'}</span><time><ClockText elapsed={e.at}/></time></div><p>{npcStatusText(e.fact)}</p>{e.interpretation?<small>{npcStatusText(e.interpretation)}</small>:null}</li>)}</ol>
      {!items.length?<p>还没有记录新的经历。</p>:null}
      <button type="button" disabled={busy||Boolean(page&&page.cursor===null)} onClick={()=>void load()}>{busy?'读取中…':history.length?'加载更早经历':'加载历史经历'}</button>
      {error?<p role="alert">{error}</p>:null}
    </details>
  </section>;
}
