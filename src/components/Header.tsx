import { Apple, Axe, CircleHelp, Flame, Moon, Pause, Play, Settings, Sun, Sunrise, Sunset, Volume2, VolumeX } from 'lucide-react';
import type { GameState } from '../games/camp/simulation/types';
import { ClockText, IconButton } from './ui';
import { WeatherButton, WEATHER_LABELS } from './WeatherPanel';
import { CAMP_PERIOD_LABELS, getCampClock } from '../games/camp/simulation/clock';

interface Props {
  game: GameState;
  speed: number;
  sound: boolean;
  soundPending: boolean;
  onPause: () => void;
  onSpeed: (speed: number) => void;
  onSound: () => void;
  onHelp: () => void;
  onWeather: () => void;
  onSettings?: () => void;
}

export function Header({ game, speed, sound, soundPending, onPause, onSpeed, onSound, onHelp, onWeather, onSettings }: Props) {
  const clock = getCampClock(game.elapsed), night = clock.isNight;
  const weather = game.weather === 'clear' ? night ? '夜色渐深' : '晴朗白昼' : WEATHER_LABELS[game.weather];
  const PeriodIcon = { morning: Sunrise, noon: Sun, afternoon: Sunset, night: Moon }[clock.period];

  return <header className="game-hud-header">
    <div className="hud-brand"><Flame fill="currentColor" strokeWidth={1.4} /><div><h1>今晚别挨饿</h1><span>CAMPMIND</span></div></div>
    <section className="hud-resources" aria-label="营地物资">
      <div className="hud-resource"><Axe className="wood-icon" size={23} aria-hidden="true" /><span>木材</span><strong data-testid="wood-count">{Math.floor(game.wood)}</strong></div>
      <div className="hud-resource"><Apple className="food-icon" size={23} aria-hidden="true" /><span>食物</span><strong data-testid="food-count">{Math.floor(game.food)}</strong></div>
      <div className="hud-resource hud-fire" title="有木材时亮起，没有木材时熄灭；不影响生存，也不消耗木材。">
        <Flame size={24} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /><span>篝火</span><strong>{game.fire > 0 ? '燃烧' : '熄灭'}</strong>
      </div>
    </section>
    <section className="hud-timebar" aria-label="旅程进度">
      <WeatherButton game={game} onOpen={onWeather} />
      <div className={`hud-day-period period-${clock.period}`} role="img" aria-label={`当前时段：${CAMP_PERIOD_LABELS[clock.period]}`} title="早上 06–10 点 · 中午 10–14 点 · 下午 14–18 点 · 晚上 18–06 点"><PeriodIcon size={19} aria-hidden="true" /><span>{CAMP_PERIOD_LABELS[clock.period]}</span></div>
      <div className="hud-clock">
        <div className="hud-clock-face"><span>第 {game.day} 天</span><time aria-label={`营地时间，${weather}`}><ClockText elapsed={game.elapsed} /></time></div>
      </div>
      <div className="hud-playback">
        <IconButton className="hud-pause" label={game.status === 'playing' ? '暂停游戏' : '继续游戏'} onClick={onPause} disabled={game.status === 'ready' || game.status === 'won' || game.status === 'lost'}>{game.status === 'playing' ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</IconButton>
        <div className="hud-speed" aria-label="游戏速度">{[1, 2, 4].map(value => <button key={value} className={value === speed ? 'selected' : ''} aria-pressed={value === speed} onClick={() => onSpeed(value)} title={`${value} 倍速度`}>{value}×</button>)}</div>
      </div>
    </section>
    <nav className="hud-system-tools" aria-label="声音与玩法">
      {onSettings ? <button className="hud-tool-button" title="游戏设置" aria-label="游戏设置" onClick={onSettings}><Settings size={20} /><span>设置</span></button> : null}
      <button className="hud-tool-button" title={sound ? '关闭音效' : '开启音效'} aria-label={sound ? '关闭音效' : '开启音效'} aria-pressed={sound} disabled={soundPending} onClick={onSound}>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}<span>{soundPending ? '开启中' : sound ? '音效开' : '音效关'}</span></button>
      <button className="hud-tool-button" title="玩法指南" aria-label="玩法指南" onClick={onHelp}><CircleHelp size={21} /><span>玩法</span></button>
    </nav>
  </header>;
}
