import { HeartCrack, HeartPulse } from 'lucide-react';
import type { GameState, NpcId } from '../game/types';
import { ACTION_LABELS, Meter, Portrait, cssVars } from './ui';

export function CrewPanel({ game, onSelect }: { game: GameState; onSelect: (id: NpcId) => void }) {
  return <aside className="crew-rail" aria-label="营地伙伴">
    {game.npcs.map((npc, index) => <button
      key={npc.id}
      onClick={() => onSelect(npc.id)}
      className={`crew-portrait-button ${game.selectedNpc === npc.id ? 'selected' : ''} ${npc.injured ? 'injured' : ''} ${!npc.alive ? 'fallen' : ''}`}
      style={cssVars({ '--npc-color': npc.color })}
      aria-pressed={game.selectedNpc === npc.id}
      aria-label={`选择${npc.name}`}
      title={`${npc.name} · ${!npc.alive ? '伙伴倒下了' : npc.injured ? '受伤了，需要帮助' : npc.manualTarget ? '正在移动' : npc.action ? ACTION_LABELS[npc.action] : '自主安排'}（${index + 1}）`}
    >
      <span className="crew-portrait-ring"><Portrait id={npc.id} /><span className="hud-crew-shortcut" aria-hidden="true">{index + 1}</span></span>
      {!npc.alive ? <span className="crew-health-badge" aria-label="伙伴倒下了"><HeartCrack size={13} /></span> : npc.injured ? <span className="crew-health-badge" aria-label="受伤了，需要帮助"><HeartPulse size={13} /></span> : null}
      <span className="crew-portrait-name">{npc.name}</span>
      <span className="crew-vitals"><Meter value={npc.energy} label="精力" compact /><Meter value={npc.hunger} tone="coral" label="饥饿" compact /></span>
    </button>)}
  </aside>;
}
