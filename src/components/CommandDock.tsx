import { ChevronUp, HeartPulse } from 'lucide-react';
import type { ActionId, GameState } from '../games/camp/simulation/types';
import { ACTION_LABELS, ActionIcon } from './ui';

const taskOptions: { action: ActionId; label: string; note: string; key: string }[] = [
  { action: 'wood', label: '采木', note: '收集营火燃料', key: 'Q' },
  { action: 'food', label: '找食', note: '寻找浆果食物', key: 'W' },
  { action: 'fire', label: '添火', note: '让温暖延续', key: 'E' },
  { action: 'rest', label: '休息', note: '喘口气再出发', key: 'R' },
  { action: 'help', label: '互助', note: '照顾受伤伙伴', key: 'T' },
];

export function CommandDock({ game, onAssign, onDetails }: { game: GameState; onAssign: (action: ActionId) => void; onDetails: () => void }) {
  const npc = game.npcs.find(n => n.id === game.selectedNpc)!;
  const disabled = !npc.alive || !['playing', 'paused'].includes(game.status);
  const status = !npc.alive ? '伙伴倒下了' : npc.manualTarget ? '当前：正在移动' : npc.command ? `安排：${ACTION_LABELS[npc.command]}` : npc.action ? `当前：${ACTION_LABELS[npc.action]}` : '自主安排 · 由伙伴决定';
  const compactStatus = !npc.alive ? '伙伴倒下' : npc.manualTarget ? '正在移动' : npc.command ? ACTION_LABELS[npc.command] : npc.action ? ACTION_LABELS[npc.action] : '自主安排';

  return <section className="command-dock hud-command-dock" aria-label="伙伴任务与沟通">
    <button className="selected-companion hud-selected-companion" onClick={onDetails} aria-label={`${npc.name}的状态与沟通`} aria-description={status} aria-haspopup="dialog" title={`${npc.name} · ${status}；查看状态与沟通`}>
      <strong>{npc.name}<ChevronUp size={11} aria-hidden="true" /></strong>
      {npc.injured ? <HeartPulse className="hud-injury-icon" size={16} aria-label="受伤了" /> : null}
      <span className="command-status">{compactStatus}</span>
    </button>
    <div className="task-buttons hud-task-buttons">{taskOptions.map(task => {
      const active = !npc.manualTarget && (npc.command ?? npc.action) === task.action;
      return <button key={task.action} className={`task-button ${active ? 'active' : ''}`} disabled={disabled} aria-label={ACTION_LABELS[task.action]} aria-pressed={active} title={`${ACTION_LABELS[task.action]} · ${task.note}（${task.key}）`} onClick={() => onAssign(task.action)}>
        <span className="task-shortcut" aria-hidden="true">{task.key}</span>
        <ActionIcon action={task.action} size={27} />
        <strong>{task.label}</strong>
      </button>;
    })}</div>
  </section>;
}
