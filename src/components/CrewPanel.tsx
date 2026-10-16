import { HeartCrack, HeartPulse } from 'lucide-react';
import type { GameState, NpcId } from '../games/camp/simulation/types';
import { ACTION_LABELS, Meter, Portrait, cssVars } from './ui';
import '../styles/nine-villagers.css';

export function CrewPanel({ game, onSelect, controlsVisible=false }: { game: GameState; onSelect: (id: NpcId) => void; controlsVisible?:boolean }) {
  return <aside className="crew-rail crew-rail-nine" aria-label="营地伙伴">
    {game.npcs.map((npc, index) => <button
      key={npc.id}
      onClick={() => onSelect(npc.id)}
      className={`crew-portrait-button ${game.selectedNpc === npc.id ? 'selected' : ''} ${npc.injured ? 'injured' : ''} ${!npc.alive ? 'fallen' : ''}`}
      style={cssVars({ '--npc-color': npc.color })}
      aria-pressed={game.selectedNpc === npc.id}
      aria-expanded={game.selectedNpc===npc.id&&controlsVisible}
      aria-label={`选择${npc.name}`}
      title={`${npc.name} · ${!npc.alive ? '已去世，无法唤醒' : npc.health<=25?'生命垂危，需要救治':npc.injured ? '受伤了，需要帮助' : npc.manualTarget ? '正在移动' : npc.action ? ACTION_LABELS[npc.action] : '自主安排'}（${index + 1}）`}
    >
      <span className="crew-portrait-ring"><Portrait id={npc.id} /><span className="hud-crew-shortcut" aria-hidden="true">{index + 1}</span></span>
      {!npc.alive ? <span className="crew-health-badge" aria-label="已去世"><HeartCrack size={13} /></span> : npc.injured||npc.health<=25 ? <span className="crew-health-badge" aria-label="需要救治"><HeartPulse size={13} /></span> : null}
      <span className="crew-portrait-name">{npc.name}</span>
      <span className="crew-vitals"><Meter value={npc.energy} label="精力" compact /><Meter value={npc.hunger} tone="coral" label="饥饿" compact /></span>
    </button>)}
  </aside>;
}
