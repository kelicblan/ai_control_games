import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { worldMessages,worldMessageText,type WorldReplyTarget } from '../gameMessages';
import { DialogueSourceIcon } from './DialogueSourceIcon';
import { filterWorldMessages, WORLD_MESSAGE_LIMITS, type WorldMessageFilter } from '../worldMessageFilters';
import '../styles/world-channel.css';

const labels = { npc:'对话',player:'指令',info:'系统',good:'消息',warning:'提醒',danger:'危险',error:'错误' };
const tabs: {id:WorldMessageFilter;label:string}[]=[{id:'all',label:'全部'},{id:'system',label:'系统'},{id:'channel',label:'频道'}];
export function WorldChannel({onReply,onMore}:{onReply?:(target:WorldReplyTarget)=>void;onMore?:()=>void}={}) {
  const messages=useSyncExternalStore(worldMessages.subscribe,worldMessages.getSnapshot,worldMessages.getSnapshot);
  const [filter,setFilter]=useState<WorldMessageFilter>('all');
  const id=useId();
  const visibleMessages=useMemo(()=>filterWorldMessages(messages,filter),[messages,filter]);
  const latestMessage=visibleMessages.at(-1);
  const transcript=useRef<HTMLDivElement>(null);
  useEffect(()=>{const element=transcript.current;if(element)element.scrollTop=element.scrollHeight;},[filter,latestMessage?.id,latestMessage?.text]);
  return <section className="world-channel" aria-label="世界频道">
    <header><strong>世界频道</strong><span className="world-channel-summary">{onMore?<button type="button" onClick={onMore}>更多</button>:null}<span>最新 {visibleMessages.length}/{WORLD_MESSAGE_LIMITS[filter]} 条</span></span></header>
    <div className="world-channel-body">
      <nav className="world-channel-tabs" role="tablist" aria-label="世界消息分类" aria-orientation="vertical">
        {tabs.map((tab,index)=><button key={tab.id} id={`${id}-${tab.id}`} type="button" role="tab" aria-selected={filter===tab.id} aria-controls={`${id}-panel`} tabIndex={filter===tab.id?0:-1} onClick={()=>setFilter(tab.id)} onKeyDown={event=>{
          const target=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
          if(target===null)return;
          event.preventDefault();event.stopPropagation();setFilter(tabs[target].id);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
        }}>{tab.label}</button>)}
      </nav>
      <div className="world-channel-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${filter}`}>
    <div ref={transcript} className="world-channel-log" role="log" aria-label={`${tabs.find(tab=>tab.id===filter)!.label}消息`} aria-live="polite" aria-relevant="additions text" tabIndex={0}>
      {visibleMessages.length?visibleMessages.map(message=><p key={message.id} className={`world-message world-message--${message.kind}`} data-message-kind={message.kind}>
        {message.kind==='npc'?<DialogueSourceIcon source={message.source} />:null}<span className="world-message-label">[{labels[message.kind]}]</span> <strong>{message.speaker}</strong><span>：{worldMessageText(message)}</span>
        {message.replyTo&&onReply?<button type="button" className="world-message-reply" aria-label={`回复${message.speaker}`} aria-haspopup="dialog" onClick={()=>onReply(message.replyTo!)}>回复</button>:null}
      </p>):<p className="world-channel-empty">{filter==='all'?'对话、指令和系统消息将在这里显示。':filter==='system'?'暂无系统消息。':'暂无 NPC 或玩家的对话、指令。'}</p>}
    </div>
      </div>
    </div>
  </section>;
}
