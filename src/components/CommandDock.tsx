import { ChevronUp, HeartPulse } from 'lucide-react';
import type { ActionId, GameState } from '../game/types';
import { ACTION_LABELS, ActionIcon, Portrait } from './ui';

const taskOptions: { action: ActionId; note: string; key: string }[] = [
  { action: 'wood', note: '收集营火燃料', key: 'Q' },
  { action: 'food', note: '寻找浆果食物', key: 'W' },
  { action: 'fire', note: '让温暖延续', key: 'E' },
  { action: 'rest', note: '喘口气再出发', key: 'R' },
  { action: 'help', note: '照顾受伤伙伴', key: 'T' },
];

export function CommandDock({ game, onAssign, onDetails }: { game: GameState; onAssign: (action: ActionId) => void; onDetails: () => void }) {
  const npc = game.npcs.find(n => n.id === game.selectedNpc)!;
  const disabled = !npc.alive || !['playing', 'paused'].includes(game.status);
  const status = !npc.alive ? '伙伴倒下了' : npc.manualTarget ? '当前：正在移动' : npc.command ? `安排：${ACTION_LABELS[npc.command]}` : npc.action ? `当前：${ACTION_LABELS[npc.action]}` : '自主安排 · 由伙伴决定';

  return <section className="command-dock hud-command-dock" aria-label="伙伴任务与沟通">
    <button className="selected-companion hud-selected-companion" onClick={onDetails} aria-label={`${npc.name}的状态与沟通`} aria-haspopup="dialog" title="查看伙伴状态、沟通与营地选项">
      <Portrait id={npc.id} />
      <strong>{npc.name}</strong>
      <span className="hud-selected-divider" />
      {npc.injured ? <HeartPulse className="hud-injury-icon" size={16} aria-label="受伤了" /> : null}
      <span className="command-status">{status}</span>
      <ChevronUp size={15} aria-hidden="true" />
    </button>
    <div className="task-buttons hud-task-buttons">{taskOptions.map(task => {
      const active = !npc.manualTarget && (npc.command ?? npc.action) === task.action;
      return <button key={task.action} className={`task-button ${active ? 'active' : ''}`} disabled={disabled} aria-label={ACTION_LABELS[task.action]} aria-pressed={active} title={`${task.note}（${task.key}）`} onClick={() => onAssign(task.action)}>
        <span className="task-shortcut" aria-hidden="true">{task.key}</span>
        <ActionIcon action={task.action} size={27} />
        <strong>{ACTION_LABELS[task.action]}</strong>
      </button>;
    })}</div>
  </section>;
}
