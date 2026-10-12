import { Apple, Axe, CircleHelp, Flag, Flame, Moon, Pause, Play, RotateCcw, Sun, Volume2, VolumeX, CloudRain, Wind } from 'lucide-react';
import type { GameState } from '../game/types';
import { ClockText, IconButton } from './ui';

interface Props { game: GameState; speed: number; sound: boolean; onPause: () => void; onSpeed: (speed: number) => void; onSound: () => void; onHelp: () => void; onNew: () => void }
export function Header({ game, speed, sound, onPause, onSpeed, onSound, onHelp, onNew }: Props) {
  const night = game.elapsed / game.duration > 0.31;
  const remaining = Math.ceil(game.duration - game.elapsed);
  return <>
    <header className="topbar">
      <div className="brand"><span className="brand-fire"><Flame fill="currentColor" strokeWidth={1} /></span><div><h1>今晚别挨饿</h1><span>CAMPMIND</span></div></div>
      <div className="resource-hud" aria-label="营地物资">
        <div className="resource"><span className="resource-icon wood"><Axe /></span><span>木材</span><strong data-testid="wood-count">{Math.floor(game.wood)}</strong></div>
        <div className="resource"><span className="resource-icon food"><Apple /></span><span>食物</span><strong data-testid="food-count">{Math.floor(game.food)}</strong></div>
        <div className={`resource fire ${game.fire < 25 ? 'resource-danger' : ''}`}><span className="resource-icon flame"><Flame fill="currentColor" /></span><span>篝火</span><strong>{Math.round(game.fire)}<small>%</small></strong><span className="fire-meter"><i style={{ width: `${game.fire}%` }} /></span></div>
      </div>
      <div className="header-tools"><IconButton label={sound ? '关闭音效' : '开启音效'} onClick={onSound}>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</IconButton><IconButton label="玩法指南" onClick={onHelp}><CircleHelp size={21} /></IconButton><IconButton label="新旅程" onClick={onNew}><RotateCcw size={19} /></IconButton></div>
    </header>
    <section className="mission-bar" aria-label="旅程进度">
      <div className="mission-text"><span className="mission-symbol"><Flag size={17} /></span><strong>{remaining <= 30 && game.status === 'playing' ? '天快亮了，召回所有伙伴！' : '守住篝火，一起等到天亮'}</strong><span className="mission-countdown">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span></div>
      <div className="time-controls"><span className="weather-label">{game.weather === 'rain' ? <CloudRain size={18} /> : game.weather === 'wind' ? <Wind size={18} /> : night ? <Moon size={18} /> : <Sun size={19} />}<span>{game.weather === 'rain' ? '林间阵雨' : game.weather === 'wind' ? '山风渐起' : night ? '夜色渐深' : '午后晴朗'}</span></span><time><ClockText elapsed={game.elapsed} /></time><span className="control-divider" /><IconButton label={game.status === 'playing' ? '暂停游戏' : '继续游戏'} onClick={onPause} disabled={game.status === 'ready' || game.status === 'won' || game.status === 'lost'}>{game.status === 'playing' ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</IconButton><div className="speed-control" aria-label="游戏速度">{[1, 2, 4].map(n => <button key={n} className={n === speed ? 'selected' : ''} aria-pressed={n === speed} onClick={() => onSpeed(n)}>{n}×</button>)}</div></div>
      <div className="day-progress" style={{ width: `${game.elapsed / game.duration * 100}%` }} />
    </section>
  </>;
}
