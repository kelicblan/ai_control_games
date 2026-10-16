import { ChevronUp, HeartPulse, MapPin } from 'lucide-react';
import type { ActionId, GameState } from '../games/camp/simulation/types';
import { ACTION_LABELS, ActionIcon } from './ui';
import {canRescue} from '../games/camp/simulation/triage';
import { wildTaskLabel } from '../games/camp/world/ecology';

const taskOptions: { action: ActionId; label: string; note: string; key: string }[] = [
  { action: 'wood', label: '伐木', note: '出寨采伐林木，再送回库存', key: 'Q' },
  { action: 'food', label: '采食', note: '出寨采集浆果、野菜和块根', key: 'W' },
  { action: 'rest', label: '休息', note: '喘口气再出发', key: 'R' },
  { action: 'help', label: '互助', note: '照顾受伤伙伴', key: 'T' },
];

export function CommandDock({ game, onAssign, onHunt, onDetails, onDispatch, dispatchActive=false, dispatchEnabled=true }: { game: GameState; onAssign: (action: ActionId) => void; onHunt?:()=>void; onDetails: () => void; onDispatch?:()=>void; dispatchActive?:boolean; dispatchEnabled?:boolean }) {
  const npc = game.npcs.find(n => n.id === game.selectedNpc)!;
  const disabled = !npc.alive || !['playing', 'paused'].includes(game.status);
  const status = !npc.alive ? '已去世，无法唤醒' : canRescue(npc)?'生命垂危，查看状态救治':npc.manualTarget ? '当前：正在移动' : npc.command ? `安排：${ACTION_LABELS[npc.command]}` : npc.action ? `当前：${ACTION_LABELS[npc.action]}` : '自主安排 · 由伙伴决定';
  const compactStatus = !npc.alive ? '已去世' : canRescue(npc)?'濒死 · 可救治':npc.manualTarget ? '正在移动' : npc.command ? ACTION_LABELS[npc.command] : npc.action ? ACTION_LABELS[npc.action] : '自主安排';

  return <section className="command-dock hud-command-dock" aria-label="伙伴任务与沟通">
    <button className="selected-companion hud-selected-companion" onClick={onDetails} aria-label={`${npc.name}的状态与沟通`} aria-description={status} aria-haspopup="dialog" title={`${npc.name} · ${status}；查看状态与沟通`}>
      <strong>{npc.name}<ChevronUp size={11} aria-hidden="true" /></strong>
      {npc.injured ? <HeartPulse className="hud-injury-icon" size={16} aria-label="受伤了" /> : null}
      <span className="command-status" title={wildTaskLabel(npc)}>{dispatchActive?'点击地图 · Esc取消':wildTaskLabel(npc)??compactStatus}</span>
    </button>
    <div className={`task-buttons hud-task-buttons ${onDispatch?'hud-task-buttons--dispatch':''}`}>{onDispatch?<button className={`task-button ${dispatchActive?'active':''}`} disabled={disabled||!dispatchEnabled} aria-label={dispatchActive?'取消派遣':'派遣到地图位置'} aria-pressed={dispatchActive} title={dispatchEnabled?'先激活派遣，再点击地图目标；一次派遣后自动退出，Esc 取消':'切换到上帝视角后派遣'} onClick={onDispatch}><MapPin size={22}/><strong>{dispatchActive?'选地点':'派遣'}</strong></button>:null}{taskOptions.map(task => {
      const active = !npc.manualTarget && (npc.command ?? npc.action) === task.action;
      return <button key={task.action} className={`task-button ${active ? 'active' : ''}`} disabled={disabled} aria-label={ACTION_LABELS[task.action]} aria-pressed={active} title={`${ACTION_LABELS[task.action]} · ${task.note}（${task.key}）`} onClick={() => onAssign(task.action)}>
        <span className="task-shortcut" aria-hidden="true">{task.key}</span>
        <ActionIcon action={task.action} size={27} />
        <strong>{task.label}</strong>
      </button>;
    })}{onHunt?<button className={`task-button ${npc.wildTask?.kind==='hunt'?'active':''}`} disabled={disabled} aria-label="寨外狩猎" title="追踪兔子、野鸡；勇敢且健康的伙伴可猎野猪。遇险撤退。" onClick={onHunt}><ActionIcon action="explore" size={27}/><strong>狩猎</strong></button>:null}</div>
  </section>;
}
