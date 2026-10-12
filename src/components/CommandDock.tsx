import { Check, Heart, HeartHandshake, House, Leaf, Megaphone, Sparkles, Utensils } from 'lucide-react';
import type { ActionId, GameCommand, GameState } from '../game/types';
import { ACTION_LABELS, ActionIcon, EMOTION_LABELS, Portrait } from './ui';
const taskOptions: { action: ActionId; note: string; key: string }[] = [
  { action: 'wood', note: '收集营火燃料', key: 'Q' }, { action: 'food', note: '寻找浆果食物', key: 'W' },
  { action: 'fire', note: '让温暖延续', key: 'E' }, { action: 'rest', note: '喘口气再出发', key: 'R' }, { action: 'help', note: '照顾受伤伙伴', key: 'T' },
];
export function CommandDock({ game, onCommand }: { game: GameState; onCommand: (command: GameCommand) => void }) {
  const npc = game.npcs.find(n => n.id === game.selectedNpc)!;
  const disabled = !npc.alive || !['playing', 'paused'].includes(game.status);
  const command = (type: GameCommand['type'], action?: ActionId | null) => onCommand({ type, action, npcId: npc.id });
  return <section className="command-dock" aria-label="伙伴任务与沟通">
    <div className="task-row"><div className="selected-companion"><Portrait id={npc.id} /><div className="selected-details"><span className="selected-eyebrow">正在指挥</span><h3>{npc.name}<span>{EMOTION_LABELS[npc.emotion]}</span></h3><span className="trust-line"><HeartHandshake size={13} />信任 {Math.round(npc.trust)}<span>·</span><Heart size={12} />{Math.round(npc.health)}</span><span className="command-status">{npc.command ? `安排：${ACTION_LABELS[npc.command]}` : npc.action ? `当前：${ACTION_LABELS[npc.action]}` : '自主安排 · 由伙伴决定'}</span></div></div>
      <div className="task-buttons">{taskOptions.map(task => <button key={task.action} className={`task-button ${(npc.command ?? npc.action) === task.action ? 'active' : ''}`} disabled={disabled} onClick={() => command('assign', task.action)}><span className="task-shortcut">{task.key}</span><ActionIcon action={task.action} size={25} /><strong>{ACTION_LABELS[task.action]}</strong><small>{task.note}</small></button>)}</div>
    </div>
    <div className="social-row"><div className="social-actions"><span className="social-label">和伙伴聊聊</span><button disabled={disabled} onClick={() => command('praise')}><Sparkles size={14} />鼓励</button><button disabled={disabled} onClick={() => command('urge')}><Megaphone size={14} />催促</button><button disabled={disabled || game.food < 1} onClick={() => command('feed')}><Utensils size={14} />分配食物 <small>−1</small></button><button className={!npc.command ? 'subtle-active' : ''} disabled={disabled} onClick={() => command('assign', null)}><Leaf size={14} />自主安排</button></div><button className="recall-button" disabled={disabled} onClick={() => onCommand({ type: 'recall' })}><House size={15} />全队回营</button></div>
    <div className="priority-row"><span>物资优先级</span>{([{ id: 'balanced', label: '均衡' }, { id: 'wood', label: '多存木材' }, { id: 'food', label: '多备食物' }] as const).map(p => <button key={p.id} disabled={disabled} aria-pressed={game.priority === p.id} onClick={() => onCommand({ type: 'priority', priority: p.id })} className={game.priority === p.id ? 'active' : ''}>{game.priority === p.id ? <Check size={11} /> : null}{p.label}</button>)}<small>指令是建议，伙伴也会照顾自己的需要。</small></div>
  </section>;
}
