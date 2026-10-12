import { BarChart3, Check, ChevronRight, Download, Heart, HeartHandshake, House, Leaf, Megaphone, RotateCcw, ShieldCheck, Sparkles, Utensils } from 'lucide-react';
import type { GameCommand, GameState } from '../game/types';
import { EMOTION_LABELS, Meter, Modal, Portrait } from './ui';

interface Props {
  game: GameState;
  saveStatus: string;
  offlineReady: boolean;
  onCommand: (command: GameCommand) => void;
  onObserve: () => void;
  onNew: () => void;
  onClose: () => void;
}

export function CampDrawer({ game, saveStatus, offlineReady, onCommand, onObserve, onNew, onClose }: Props) {
  const npc = game.npcs.find(n => n.id === game.selectedNpc)!;
  const disabled = !npc.alive || !['playing', 'paused'].includes(game.status);
  const command = (type: 'praise' | 'urge' | 'feed') => onCommand({ type, npcId: npc.id });

  return <Modal title="营地与伙伴" onClose={onClose} className="hud-drawer camp-drawer">
    <div className="camp-companion-heading">
      <Portrait id={npc.id} />
      <div><span className="camp-companion-role">{npc.role}</span><h3>{npc.name}<span>{!npc.alive ? '倒下' : npc.injured ? '需要照顾' : EMOTION_LABELS[npc.emotion]}</span></h3><p><HeartHandshake size={13} />信任 {Math.round(npc.trust)}<span>·</span><Heart size={13} />健康 {Math.round(npc.health)}</p></div>
      <div className="camp-companion-vitals"><Meter value={npc.energy} label="精力" /><Meter value={npc.hunger} label="饥饿" tone="coral" /></div>
    </div>
    <div className="camp-crew-switcher" aria-label="切换沟通伙伴">{game.npcs.map(member => <button key={member.id} onClick={() => onCommand({ type: 'select', npcId: member.id })} aria-label={`与${member.name}沟通`} aria-pressed={npc.id === member.id} className={npc.id === member.id ? 'selected' : ''}>{member.name}{npc.id === member.id ? <Check size={13} /> : null}</button>)}</div>
    <section className="camp-communication" aria-label="和伙伴聊聊">
      <div className="camp-social-actions">
        <button disabled={disabled} onClick={() => command('praise')}><Sparkles size={20} /><span><strong>鼓励</strong><small>给他一点信心</small></span></button>
        <button disabled={disabled} onClick={() => command('urge')}><Megaphone size={20} /><span><strong>催促</strong><small>提醒当前安排</small></span></button>
        <button disabled={disabled || game.food < 1} onClick={() => command('feed')}><Utensils size={20} /><span><strong>分配食物</strong><small>消耗 1 份食物</small></span></button>
        <button disabled={disabled} className={!npc.command && !npc.manualTarget ? 'subtle-active' : ''} onClick={() => onCommand({ type: 'assign', npcId: npc.id, action: null })}><Leaf size={20} /><span><strong>自主安排</strong><small>让伙伴自己决定</small></span></button>
      </div>
      <p className="camp-command-hint">安排是建议，伙伴也会照顾自己的需要。</p>
    </section>
    <section className="camp-priority" aria-label="物资优先级">
      <h3>物资优先级</h3>
      <div>{([{ id: 'balanced', label: '均衡' }, { id: 'wood', label: '多存木材' }, { id: 'food', label: '多备食物' }] as const).map(priority => <button key={priority.id} disabled={disabled} aria-pressed={game.priority === priority.id} onClick={() => onCommand({ type: 'priority', priority: priority.id })} className={game.priority === priority.id ? 'active' : ''}>{game.priority === priority.id ? <Check size={13} /> : null}{priority.label}</button>)}</div>
    </section>
    <button className="camp-recall" disabled={disabled} onClick={() => { onCommand({ type: 'recall' }); onClose(); }}><House size={20} /><span><strong>全队回营</strong><small>一起回到篝火附近</small></span><ChevronRight size={17} /></button>
    <div className="camp-menu-links"><button onClick={onObserve}><BarChart3 size={18} />决策观察<ChevronRight size={15} /></button><button aria-label="新旅程" onClick={onNew}><RotateCcw size={17} />新旅程<ChevronRight size={15} /></button></div>
    {saveStatus || offlineReady ? <div className="camp-save-status">{saveStatus ? <span><ShieldCheck size={13} />{saveStatus}</span> : null}{offlineReady ? <span><Download size={13} />离线资源已备妥</span> : null}</div> : null}
  </Modal>;
}
