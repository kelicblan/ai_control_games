import { BarChart3, Check, ChevronRight, Download, Heart, HeartHandshake, House, Leaf, Megaphone, MessageCircle, RotateCcw, ShieldCheck, Sparkles, Utensils } from 'lucide-react';
import { useId, useState } from 'react';
import type { GameCommand, GameState } from '../games/camp/simulation/types';
import { EMOTION_LABELS, Meter, Modal, Portrait } from './ui';
import type { DialogueStatus } from '../games/camp/dialogue';
import '../styles/dialogue.css';
import { PartnerSocialProfile } from './PartnerSocialProfile';
import { NpcMemoryPanel } from './NpcMemoryPanel';
import '../styles/camp-tabs.css';
import {canRescue,RESCUE_FOOD_COST} from '../games/camp/simulation/triage';

interface Props {
  game: GameState;
  saveStatus: string;
  offlineReady: boolean;
  dialogue: DialogueStatus;
  onToggleDialogue: () => void;
  onRetryDialogue: () => void;
  onCommand: (command: GameCommand) => void;
  onObserve: () => void;
  onTalk: () => void;
  onNew: () => void;
  onSettings?: () => void;
  onGameSettings?: () => void;
  onClose: () => void;
}

export function CampDrawer({ game, saveStatus, offlineReady, dialogue, onToggleDialogue, onRetryDialogue, onCommand, onObserve, onTalk, onNew, onClose, onSettings, onGameSettings }: Props) {
  const tabs = ['伙伴互动', '状态与记忆', '性格与关系', '营地管理'];
  const [tab, setTab] = useState(0);
  const tabId = useId();
  const npc = game.npcs.find(n => n.id === game.selectedNpc)!;
  const disabled = !npc.alive || !['playing', 'paused'].includes(game.status);
  const command = (type: 'praise' | 'urge' | 'feed' | 'rescue') => onCommand({ type, npcId: npc.id });

  return <Modal title="营地与伙伴" onClose={onClose} className="hud-drawer camp-drawer">
    <div className="camp-companion-heading">
      <Portrait id={npc.id} />
      <div><span className="camp-companion-role">{npc.role}</span><h3>{npc.name}<span>{!npc.alive ? '已去世' : canRescue(npc) ? '濒死 · 可救治' : npc.injured ? '需要照顾' : EMOTION_LABELS[npc.emotion]}</span></h3><p><HeartHandshake size={13} />信任 {Math.round(npc.trust)}<span>·</span><Heart size={13} />健康 {Math.round(npc.health)}</p></div>
      <div className="camp-companion-vitals"><Meter value={npc.energy} label="精力" /><Meter value={npc.hunger} label="饥饿" tone="coral" /></div>
    </div>
    {!npc.alive?<p className="camp-command-hint">这位伙伴已经去世，并非睡着，无法唤醒或救治。世界会继续运行；仍活着且健康不高于 25 的伙伴可以及时救治。</p>:canRescue(npc)?<p className="camp-command-hint">伙伴生命垂危，请及时救治。健康耗尽后将永久去世。</p>:null}
    <div className="camp-crew-switcher" aria-label="切换沟通伙伴">{game.npcs.map(member => <button key={member.id} onClick={() => onCommand({ type: 'select', npcId: member.id })} aria-label={`与${member.name}沟通`} aria-pressed={npc.id === member.id} className={npc.id === member.id ? 'selected' : ''}>{member.name}{npc.id === member.id ? <Check size={13} /> : null}</button>)}</div>
    <div className="camp-tabs" role="tablist" aria-label="营地与伙伴分类">{tabs.map((label, index) => <button
      key={label} type="button" role="tab" id={`${tabId}-tab-${index}`} aria-selected={tab === index}
      aria-controls={`${tabId}-panel`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setTab(next);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>{label}</button>)}</div>
    <div key={`${tab}-${npc.id}`} className="camp-tab-panel" role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-tab-${tab}`} tabIndex={0}>
    {tab === 0 ? <>
    <button className="partner-talk-button" aria-label="主动聊聊" disabled={disabled} onClick={onTalk}><MessageCircle size={19} /><span><strong>主动聊聊</strong><small>听近况、商量分工和承诺</small></span><ChevronRight size={17} /></button>
    <section className="camp-communication" aria-label="和伙伴聊聊">
      <div className="camp-social-actions">
        <button disabled={disabled} onClick={() => command('praise')}><Sparkles size={20} /><span><strong>鼓励</strong><small>给伙伴一点信心</small></span></button>
        <button disabled={disabled} onClick={() => command('urge')}><Megaphone size={20} /><span><strong>催促</strong><small>提醒当前安排</small></span></button>
        <button disabled={disabled || game.food < 1} onClick={() => command('feed')}><Utensils size={20} /><span><strong>分配食物</strong><small>消耗 1 份食物</small></span></button>
        {canRescue(npc)?<button disabled={disabled||game.food<RESCUE_FOOD_COST} onClick={()=>command('rescue')}><HeartHandshake size={20}/><span><strong>救治伙伴</strong><small>消耗 {RESCUE_FOOD_COST} 份食物 · 恢复至 40 健康</small></span></button>:null}
        <button disabled={disabled} className={!npc.command && !npc.manualTarget ? 'subtle-active' : ''} onClick={() => onCommand({ type: 'assign', npcId: npc.id, action: null })}><Leaf size={20} /><span><strong>自主安排</strong><small>让伙伴自己决定</small></span></button>
      </div>
      <p className="camp-command-hint">安排是建议，伙伴也会照顾自己的需要。</p>
    </section>
    </> : tab === 1 ? <NpcMemoryPanel game={game} npc={npc} /> : tab === 2 ? <PartnerSocialProfile game={game} npc={npc} showMemory={false} /> : <>
    <section className="camp-priority" aria-label="物资优先级">
      <h3>物资优先级</h3>
      <div>{([{ id: 'balanced', label: '均衡' }, { id: 'wood', label: '多存木材' }, { id: 'food', label: '多备食物' }] as const).map(priority => <button key={priority.id} disabled={disabled} aria-pressed={game.priority === priority.id} onClick={() => onCommand({ type: 'priority', priority: priority.id })} className={game.priority === priority.id ? 'active' : ''}>{game.priority === priority.id ? <Check size={13} /> : null}{priority.label}</button>)}</div>
    </section>
    <button className="camp-recall" disabled={disabled} onClick={() => { onCommand({ type: 'recall' }); onClose(); }}><House size={20} /><span><strong>全员回寨</strong><small>到村寨广场集合，携物先入仓</small></span><ChevronRight size={17} /></button>
    <div className="camp-menu-links"><button onClick={onObserve}><BarChart3 size={18} />决策观察<ChevronRight size={15} /></button><button aria-label="新旅程" onClick={onNew}><RotateCcw size={17} />新旅程<ChevronRight size={15} /></button></div>
    {onSettings ? <button className="secondary-button" onClick={onSettings}>角色初始设置 · 下局生效</button> : null}
    {onGameSettings ? <button className="secondary-button" onClick={onGameSettings}>游戏设置 · 对话模型</button> : null}
    <section className="camp-dialogue" aria-label="伙伴台词">
      <div><strong>伙伴台词</strong><button onClick={onToggleDialogue} aria-pressed={dialogue.enabled}>{dialogue.modelName ?? 'MiniMind3'} {dialogue.enabled ? '开' : '关'}</button></div>
      <p role="status">{dialogue.mode === 'ready' ? `${dialogue.modelName ?? 'MiniMind3'} 已就绪，伙伴边行动边说话。`
        : dialogue.mode === 'checking' ? dialogue.modelStage === 'load' ? '正在将模型加载到游戏中，伙伴照常行动。'
          : dialogue.modelStage === 'verify' ? '正在校验本地模型，伙伴照常行动。'
          : dialogue.modelStage === 'initialize' || dialogue.modelStage === 'idle' ? '正在准备选中的模型，伙伴照常行动。'
          : `正在后台下载模型 ${Math.round((dialogue.downloadProgress ?? 0) * 100)}%，伙伴照常行动。`
        : dialogue.mode === 'off' ? '使用即时回应。' : dialogue.modelRetryStopped ? '暂用即时回应，自动重试已停止，可在游戏设置中重试。' : '暂用即时回应，后台会自动重试模型。'}</p>
      {dialogue.enabled ? <><small>生成 {dialogue.generated} 句 · 即时缓存 {dialogue.cached} 句 · 待用 {dialogue.poolSize} 句{dialogue.latencyMs > 0 ? ` · 最近生成 ${Math.round(dialogue.latencyMs)} ms` : ''}</small>
        {dialogue.mode === 'ready' ? <small>{dialogue.modelBackend === 'native' ? '原生 llama.cpp · 本机推理' : dialogue.modelBackend === 'remote' ? '远程接口 · OpenAI 兼容' : `${dialogue.modelCached ? '已从本地缓存加载' : dialogue.modelPersistent === false ? '本次使用内存模型，设备未允许保存缓存' : '模型已保存到本地缓存'} · 浏览器 WASM`}</small> : null}
        {dialogue.modelError && dialogue.mode === 'fallback' ? <small>{dialogue.modelError}</small> : null}
        {dialogue.mode === 'fallback' ? <button onClick={onRetryDialogue}>重新加载台词模型</button> : null}</> : null}
    </section>
    {saveStatus || offlineReady ? <div className="camp-save-status">{saveStatus ? <span><ShieldCheck size={13} />{saveStatus}</span> : null}{offlineReady ? <span><Download size={13} />离线资源已备妥</span> : null}</div> : null}
    </>}
    </div>
  </Modal>;
}
