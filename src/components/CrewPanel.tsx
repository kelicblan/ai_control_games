import { Heart, Pin, ScrollText, Users, Zap } from 'lucide-react';
import type { GameState, NpcId } from '../game/types';
import { ACTION_LABELS, ActionIcon, ClockText, EMOTION_LABELS, Meter, Portrait, cssVars } from './ui';

export function CrewPanel({ game, onSelect }: { game: GameState; onSelect: (id: NpcId) => void }) {
  return <aside className="crew-panel">
    <div className="panel-title"><h2><Users size={19} />营地伙伴</h2><span>{game.npcs.filter(n => n.alive).length}<small> / 3</small></span></div>
    <div className="crew-list">{game.npcs.map((npc, i) => <button key={npc.id} onClick={() => onSelect(npc.id)} className={`crew-card ${game.selectedNpc === npc.id ? 'selected' : ''} ${!npc.alive ? 'fallen' : ''}`} style={cssVars({ '--npc-color': npc.color })} aria-pressed={game.selectedNpc === npc.id} aria-label={`选择${npc.name}`}>
      <div className="crew-card-main"><div className="portrait-wrap"><Portrait id={npc.id} /><span className="crew-shortcut">{i + 1}</span></div><div className="crew-info"><div className="crew-name"><h3>{npc.name}</h3>{game.selectedNpc === npc.id ? <Pin size={15} /> : <span className={`emotion-dot ${npc.emotion}`} />}</div><p>{npc.role}</p><Meter value={npc.energy} label="精力" /><Meter value={npc.hunger} tone="coral" label="饥饿" /></div></div>
      <div className="crew-action">{npc.alive ? <ActionIcon action={npc.action ?? 'camp'} size={16} /> : <Heart size={16} />}<span>{!npc.alive ? '伙伴倒下了' : npc.injured ? '受伤了 · 需要帮助' : npc.action ? ACTION_LABELS[npc.action] : '等待新的安排'}</span><small>{EMOTION_LABELS[npc.emotion]}</small></div>
      {npc.action ? <span className="crew-task-progress" style={{ width: `${npc.progress * 100}%` }} /> : null}
    </button>)}</div>
    <div className="team-note"><Zap size={13} /><span>点击伙伴或按 1 / 2 / 3 选择</span></div>
    <section className="journal"><div className="panel-title"><h2><ScrollText size={18} />林间手记</h2><span className="journal-live">实时</span></div><div className="journal-list" aria-label="活动日志">{game.events.length ? game.events.slice(-5).reverse().map(event => <div className={`journal-entry ${event.kind}`} key={event.id}><i /><div><time><ClockText elapsed={event.time} /></time><p>{event.text}</p></div></div>) : <p className="journal-empty">篝火刚刚点亮。<br />我们的故事，从这里开始。</p>}</div></section>
  </aside>;
}
