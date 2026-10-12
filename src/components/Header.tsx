import { Apple, Axe, CircleHelp, CloudRain, Flame, Moon, Pause, Play, Sun, Volume2, VolumeX, Wind } from 'lucide-react';
import type { GameState } from '../game/types';
import { ClockText, IconButton } from './ui';

interface Props {
  game: GameState;
  speed: number;
  sound: boolean;
  onPause: () => void;
  onSpeed: (speed: number) => void;
  onSound: () => void;
  onHelp: () => void;
}

export function Header({ game, speed, sound, onPause, onSpeed, onSound, onHelp }: Props) {
  const night = game.elapsed / game.duration > 0.31;
  const remaining = Math.max(0, Math.ceil(game.duration - game.elapsed));
  const weather = game.weather === 'rain' ? '林间阵雨' : game.weather === 'wind' ? '山风渐起' : night ? '夜色渐深' : '午后晴朗';
  const WeatherIcon = game.weather === 'rain' ? CloudRain : game.weather === 'wind' ? Wind : night ? Moon : Sun;
  const endingSoon = remaining <= 30 && game.status === 'playing';

  return <header className="game-hud-header">
    <div className="hud-brand"><Flame fill="currentColor" strokeWidth={1.4} /><div><h1>今晚别挨饿</h1><span>CAMPMIND</span></div></div>
    <section className="hud-resources" aria-label="营地物资">
      <div className="hud-resource"><Axe className="wood-icon" size={23} aria-hidden="true" /><span>木材</span><strong data-testid="wood-count">{Math.floor(game.wood)}</strong></div>
      <div className="hud-resource"><Apple className="food-icon" size={23} aria-hidden="true" /><span>食物</span><strong data-testid="food-count">{Math.floor(game.food)}</strong></div>
      <div className={`hud-resource hud-fire ${game.fire < 25 ? 'resource-danger' : ''}`}>
        <Flame size={24} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /><span>篝火</span><strong>{Math.round(game.fire)}<small>%</small></strong>
        <span className="hud-fire-meter" role="meter" aria-label="篝火" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(game.fire)}><i style={{ width: `${Math.max(0, Math.min(100, game.fire))}%` }} /></span>
      </div>
    </section>
    <section className="hud-timebar" aria-label="旅程进度">
      <div className={`hud-clock ${endingSoon ? 'ending-soon' : ''}`}>
        <WeatherIcon size={19} aria-label={weather} />
        <div className="hud-clock-face"><span>第 {game.day} 天</span><time aria-label={`营地时间，${weather}`}><ClockText elapsed={game.elapsed} /></time></div>
        <div className="hud-time-left"><span>距天亮</span><strong className="mission-countdown">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong></div>
      </div>
      <div className="hud-playback">
        <IconButton className="hud-pause" label={game.status === 'playing' ? '暂停游戏' : '继续游戏'} onClick={onPause} disabled={game.status === 'ready' || game.status === 'won' || game.status === 'lost'}>{game.status === 'playing' ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</IconButton>
        <div className="hud-speed" aria-label="游戏速度">{[1, 2, 4].map(value => <button key={value} className={value === speed ? 'selected' : ''} aria-pressed={value === speed} onClick={() => onSpeed(value)} title={`${value} 倍速度`}>{value}×</button>)}</div>
      </div>
    </section>
    <nav className="hud-system-tools" aria-label="声音与玩法">
      <button className="hud-tool-button" title={sound ? '关闭音效' : '开启音效'} aria-label={sound ? '关闭音效' : '开启音效'} aria-pressed={sound} onClick={onSound}>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}<span>{sound ? '音效开' : '音效关'}</span></button>
      <button className="hud-tool-button" title="玩法指南" aria-label="玩法指南" onClick={onHelp}><CircleHelp size={21} /><span>玩法</span></button>
    </nav>
    {endingSoon ? <p className="hud-home-warning" role="status">天快亮了，召回所有伙伴！</p> : null}
  </header>;
}
