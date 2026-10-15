import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { DialogueSourceIcon } from './DialogueSourceIcon';
import { ensurePlayerSession } from '../integrations/world/session';
import { worldMessageText, type WorldMessage } from '../gameMessages';
interface Page {items:(WorldMessage&{key:string})[];total:number;npc:number;player:number;page:number;pages:number;through:number;scope:string}
export function ConversationHistoryDialog({onClose}:{onClose:()=>void}) {
 const [data,setData]=useState<Page|null>(null),[page,setPage]=useState(1),[version,setVersion]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [anchor,setAnchor]=useState<{through:number;scope:string}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();setBusy(true);setError('');
  void ensurePlayerSession().then(async()=>{
   const query=new URLSearchParams({page:String(page),...(anchor?{through:String(anchor.through),scope:anchor.scope}:{})});
   const response=await fetch(`/game-api/conversations?${query}`,{credentials:'same-origin',headers:{'X-Camp-Tab':'conversation-history'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
   const result=await response.json();if(!response.ok)throw new Error(result.error??'读取记录失败');
   if(!controller.signal.aborted){setData(result);setBusy(false);}
  }).catch(reason=>{if(!controller.signal.aborted){setError(reason instanceof Error?reason.message:'读取记录失败');setBusy(false);}});
  return ()=>controller.abort();
 },[page,version,anchor]);
 const navigate=(next:number)=>{if(data&&!anchor)setAnchor({through:data.through,scope:data.scope});setPage(next);};
 const refresh=()=>{setAnchor(null);setPage(1);setVersion(v=>v+1);};
 return <Modal title="全部对话记录" onClose={onClose} className="conversation-history-modal">
  <div className="conversation-history-stats"><span>共 {data?.total??0} 条 · NPC {data?.npc??0} 条 · 玩家 {data?.player??0} 条</span><button disabled={busy} onClick={refresh}>刷新</button></div>
  <div className="conversation-history-log" aria-busy={busy}>
   {error?<p role="alert">{error}<button onClick={refresh}>重试</button></p>:busy?<p role="status">正在读取对话记录…</p>:data?.items.length?data.items.map(message=><p key={message.key} className={`world-message world-message--${message.kind}`}>
    {message.kind==='npc'?<DialogueSourceIcon source={message.source}/>:null}<strong>{message.speaker}</strong>：{worldMessageText(message)}
   </p>):<p>暂无对话记录。</p>}
  </div>
  <footer className="conversation-history-pages"><button disabled={busy||!data||data.page<=1} onClick={()=>navigate((data?.page??1)-1)}>上一页</button><span>第 {data?.page??1} / {data?.pages??1} 页 · 每页 20 条</span><button disabled={busy||!data||data.page>=data.pages} onClick={()=>navigate((data?.page??1)+1)}>下一页</button></footer>
 </Modal>;
}
