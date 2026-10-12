import { Apple, Archive, Axe, Compass, Flame, Moon, TentTree } from 'lucide-react';
import type { ActionId, GameState, NpcId } from '../game/types';
import { ACTION_LABELS, ActionIcon, cssVars } from './ui';

const locations = [
  { action: 'wood' as ActionId, name: '松林', hint: '木材采集点', x: 19, y: 24, icon: Axe },
  { action: 'food' as ActionId, name: '浆果丛', hint: '寻找新鲜食物', x: 80, y: 20, icon: Apple },
  { action: 'fire' as ActionId, name: '篝火', hint: '温暖与安全', x: 54, y: 40, icon: Flame },
  { action: 'rest' as ActionId, name: '休息区', hint: '恢复精力', x: 79, y: 67, icon: TentTree },
];
export function CampMap({ game, onSelect, onAssign, onResume }: { game: GameState; onSelect: (id: NpcId) => void; onAssign: (action: ActionId) => void; onResume: () => void }) {
  const phase = game.elapsed / game.duration;
  const shade = phase > 0.88 ? 0.36 * (1 - (phase - 0.88) / 0.12) : Math.max(0, Math.min(0.38, (phase - 0.2) * 0.65));
  return <div className={`camp-map ${game.weather} ${game.status === 'paused' ? 'map-paused' : ''}`} aria-label="可交互营地地图">
    <img className="camp-art" src={`${import.meta.env.BASE_URL}assets/camp.png`} alt="林间营地，包含松林、浆果丛、篝火、储物区与帐篷" draggable="false" />
    <div className="night-shade" style={{ opacity: shade }} />
    <div className="fire-glow" style={{ opacity: Math.max(0, game.fire / 100) }} />
    <div className="embers" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={cssVars({ '--i': i })} />)}</div>
    <div className="map-grain" />
    <div className="map-topline"><span><i />{game.scenario === 'storm' ? '风雨营地' : game.scenario === 'conflict' ? '分歧时刻' : '松风营地'}</span><small>第 {game.day} 天</small></div>
    {locations.map(location => <button key={location.action} className={`location-label location-${location.action}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} onClick={() => onAssign(location.action)} disabled={game.status !== 'playing' && game.status !== 'paused'} aria-label={`让选中伙伴${ACTION_LABELS[location.action]}`}><location.icon size={20} /><div><strong>{location.name}</strong><small>{location.action === 'fire' ? `${Math.round(game.fire)}% · 消耗木材添柴` : location.hint}</small>{location.action === 'fire' ? <span className="location-fire-meter"><i style={{ width: `${game.fire}%` }} /></span> : null}</div><span className="location-plus">+</span></button>)}
    <div className="storage-label" style={{ left: '30%', top: '79%' }}><Archive size={14} />储物区</div>
    <button className="explore-marker" title="让选中伙伴探索林间" aria-label="让选中伙伴探索林间" onClick={() => onAssign('explore')} style={{ left: '12%', top: '62%' }} disabled={game.status !== 'playing' && game.status !== 'paused'}><Compass size={22} /></button>
    {game.npcs.map((npc, index) => {
      const moving = Math.hypot(npc.position.x - npc.destination.x, npc.position.y - npc.destination.y) > 0.8;
      return <button key={npc.id} className={`map-npc ${game.selectedNpc === npc.id ? 'selected' : ''} ${moving ? 'moving' : 'working'} ${npc.action === 'rest' ? 'resting' : ''} ${!npc.alive ? 'fallen' : ''}`} onClick={() => onSelect(npc.id)} aria-label={`地图上选择${npc.name}`} style={cssVars({ left: `${npc.position.x}%`, top: `${npc.position.y}%`, '--npc-color': npc.color, '--npc-offset': index - 1, zIndex: Math.round(npc.position.y) + 20 })}>
        <span className="selection-ring" /><span className={`character-sprite sprite-${npc.id}`} />
        {npc.speech && npc.speechUntil > game.elapsed && game.status !== 'ready' && game.selectedNpc === npc.id ? <span className="npc-speech">{npc.speech}</span> : null}
        <span className="npc-nameplate">{npc.injured ? <HeartWarning /> : npc.action === 'rest' ? <Moon size={10} /> : <ActionIcon action={npc.action ?? 'camp'} size={10} />}{npc.name}<span className="npc-work-bar"><i style={{ width: `${npc.progress * 100}%` }} /></span></span>
      </button>;
    })}
    {game.weather === 'rain' ? <div className="rain-overlay" aria-hidden="true">{Array.from({ length: 38 }, (_, i) => <i key={i} style={cssVars({ '--i': i, left: `${(i * 37) % 100}%` })} />)}</div> : null}
    {game.danger > 48 ? <div className="danger-notice"><span />林间有动静，小心行动</div> : null}
    <div className="map-caption"><span className="key-hint">点击地点分配任务</span><span>每一个决定，都影响今晚。</span></div>
    {game.status === 'paused' ? <button className="paused-chip" onClick={onResume}><span className="pause-glyph">Ⅱ</span>旅程已暂停 <small>点击继续</small></button> : null}
  </div>;
}
function HeartWarning() { return <span className="injury-indicator">!</span>; }
