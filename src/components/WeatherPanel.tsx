import { ArrowRight, ChevronRight, CloudLightning, CloudRain, Flame, Network, ShieldCheck, Sun, Umbrella, Volume2, VolumeX, Waves, Wind } from 'lucide-react';
import type { DecisionRecord, GameState, Weather } from '../games/camp/simulation/types';
import { getWeatherSnapshot, windDirectionLabel } from '../games/camp/simulation/weather';
import { ACTION_LABELS, ActionIcon, Modal, Portrait } from './ui';

export const WEATHER_LABELS: Record<Weather, string> = { clear: '林间晴朗', wind: '山风渐起', rain: '林间阵雨', storm: '雷雨交加' };
export const WEATHER_ICONS = { clear: Sun, wind: Wind, rain: CloudRain, storm: CloudLightning };
const WEATHER_CHOICES: { kind: Weather; title: string; note: string }[] = [
  { kind: 'wind', title: '吹起山风', note: '树梢摇动 · 火星飘散' },
  { kind: 'rain', title: '落下一场雨', note: '人物淋湿 · 留意体力' },
  { kind: 'storm', title: '唤来雷暴', note: '雷声逼近 · 寻找遮蔽' },
  { kind: 'clear', title: '让天空放晴', note: '雨歇风缓 · 继续劳作' },
];
const percent = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

export function WeatherButton({ game, onOpen }: { game: GameState; onOpen: () => void }) {
  const Icon = WEATHER_ICONS[game.weather];
  const recent = [...game.decisions].reverse().find(record => record.npcId === game.selectedNpc
    && (record.trigger === 'weather' || record.trigger === 'thunder') && game.elapsed - record.time < 8);
  return <div className="weather-hud">
    <button className={`weather-pill weather-${game.weather}`} onClick={onOpen} aria-label="天气观察" aria-haspopup="dialog"
      title={`${WEATHER_LABELS[game.weather]} · 风 ${percent(game.atmosphere.windStrength)}% · 吹向${windDirectionLabel(game.atmosphere.windAngle)}`}
      disabled={!['playing', 'paused'].includes(game.status)}>
      <Icon size={19} aria-hidden="true" /><span><strong>{WEATHER_LABELS[game.weather]}</strong>
        <small>风 {percent(game.atmosphere.windStrength)}% · 吹向{windDirectionLabel(game.atmosphere.windAngle)}</small></span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
    {recent ? <div className="weather-live-choice" data-testid="weather-live-choice">
      <ActionIcon action={recent.action} size={13} /><span>{game.npcs.find(npc => npc.id === recent.npcId)?.name}选择{ACTION_LABELS[recent.action]}</span>
      <small>{recent.source === 'model' ? '模型' : recent.source === 'rules' ? '规则' : '回退'}</small>
    </div> : null}
  </div>;
}

export function RecordedWeather({ record }: { record: DecisionRecord }) {
  const snapshot = record.weather;
  if (!snapshot) return record.features.length === 36
    ? <p className="weather-history-note">旧版 36 维记录：保留当时的真实输入；这条记录没有完整天气快照。</p> : null;
  const Icon = WEATHER_ICONS[snapshot.kind];
  const trigger = record.trigger === 'weather' ? '天气变化后重新权衡' : record.trigger === 'thunder' ? '听到雷声后重新权衡'
    : record.trigger === 'command' ? '收到玩家安排' : record.trigger === 'needs' ? '身体状态变化' : '自主选择下一项任务';
  return <section className="recorded-weather" aria-label="决策时的天气输入">
    <div className="recorded-weather-title"><Icon size={18} /><strong>{WEATHER_LABELS[snapshot.kind]}</strong><span>{trigger}</span></div>
    <div className="recorded-weather-values"><span>风力 <b>{percent(snapshot.windStrength)}%</b></span><span>雨量 <b>{percent(snapshot.rainIntensity)}%</b></span>
      <span>雷暴 <b>{percent(snapshot.stormRisk)}%</b></span><span>淋湿 <b>{Math.round(snapshot.wetness)}%</b></span>
      <span>暴露 <b>{percent(snapshot.exposure)}%</b></span><span>雨棚 <b>{Math.round(snapshot.shelterIntegrity)}%</b></span></div>
    <div className="recorded-weather-action"><span>{record.previousAction ? ACTION_LABELS[record.previousAction] : '尚未执行任务'}</span><ArrowRight size={14} />
      <strong>{ACTION_LABELS[record.action]}</strong><small>{record.previousAction === record.action ? '继续原任务' : '本次选择'}</small></div>
    <p>以上是输入与输出的实际记录，动作偏好由下方分数呈现。</p>
  </section>;
}

export function WeatherDialog({ game, sound, soundPending, onSound, onWeather, onObserve, onClose }: {
  game: GameState; onWeather: (weather: Weather) => void; onObserve: () => void; onClose: () => void;
  sound: boolean; soundPending: boolean; onSound: () => void;
}) {
  const Icon = WEATHER_ICONS[game.weather];
  const atmosphere = game.atmosphere;
  const remaining = Math.max(0, Math.ceil(game.weatherUntil - game.elapsed));
  return <Modal title="风雨中的营地" onClose={onClose} className="weather-dialog hud-drawer">
    <p className="dialog-description">山里的天气随时会变。看看伙伴如何照顾自己，也照顾这一团火。</p>
    <section className={`weather-current weather-${game.weather}`} aria-label="当前天气">
      <Icon size={36} /><div><span>此刻的松林</span><h3>{WEATHER_LABELS[game.weather]}</h3>
        <p>{remaining > 0 ? `本轮天气还将持续约 ${remaining} 个游戏秒` : '天气会随旅程自然变化'}</p></div>
    </section>
    <div className="weather-meters"><div><Wind size={16} /><span>风力</span><strong>{percent(atmosphere.windStrength)}%</strong></div>
      <div><CloudRain size={16} /><span>雨量</span><strong>{percent(atmosphere.rainIntensity)}%</strong></div>
      <div><ShieldCheck size={16} /><span>雨棚</span><strong>{Math.round(game.shelterIntegrity)}%</strong></div></div>
    <h3 className="weather-section-title">改变天气，观察下一步</h3>
    <div className="weather-choice-grid">{WEATHER_CHOICES.map(choice => {
      const ChoiceIcon = WEATHER_ICONS[choice.kind];
      return <button key={choice.kind} onClick={() => onWeather(choice.kind)} aria-label={choice.title} disabled={!['playing', 'paused'].includes(game.status)}>
        <ChoiceIcon size={23} /><span><strong>{choice.title}</strong><small>{choice.note}</small></span></button>;
    })}</div>
    <p className="weather-intervention-note">每次触发都会写入手记。关闭窗口回到场景后，留意气泡、动作和篝火的变化。</p>
    <section className="weather-wind-direction" aria-label="风向">
      <div className="weather-wind-compass" aria-hidden="true"><small>北</small>
        <span style={{ transform: `rotate(${atmosphere.windAngle}rad)` }}><ArrowRight size={29} /></span></div>
      <div><strong>风吹向{windDirectionLabel(atmosphere.windAngle)}</strong>
        <p>来自{windDirectionLabel(atmosphere.windAngle + Math.PI)}方 · 树梢、雨线和烟雾随风偏转</p>
        <small>方位以地图为准，北在上方</small></div>
    </section>
    <button className={`weather-sound-button ${sound ? 'sound-on' : ''}`} onClick={onSound}
      aria-label={sound ? '关闭环境音' : '开启环境音'} aria-pressed={sound} disabled={soundPending}>
      {sound ? <Volume2 size={22} /> : <VolumeX size={22} />}<span><strong>{soundPending ? '正在开启声音…' : sound ? '环境音已开启' : '听见这片营地'}</strong>
        <small>{sound ? '关闭面板后聆听 · 跟随选中的伙伴' : '点击开启风雨、溪水与篝火声'}</small></span>
      <span className="weather-sound-switch" aria-hidden="true"><i /></span>
    </button>
    <p className="weather-physical-note"><Waves size={15} /><span>溪流顺河道向南，河心流得更快；风雨扰动水面。</span></p>
    <div className="weather-crew" aria-label="伙伴在天气中的状态">{game.npcs.map(npc => {
      const snapshot = getWeatherSnapshot(game, npc);
      return <div key={npc.id} className="weather-crew-row"><Portrait id={npc.id} /><div><strong>{npc.name}</strong>
        <span>{snapshot.exposure < .3 ? '正在雨棚下' : '位于露天'} · 淋湿 {Math.round(npc.wetness)}%</span></div>
        <span className="weather-crew-task"><ActionIcon action={npc.action ?? 'camp'} size={14} />{npc.action ? ACTION_LABELS[npc.action] : '正在权衡'}</span></div>;
    })}</div>
    <div className="weather-help"><Umbrella size={18} /><p>休息区的雨棚能挡雨。露天工作会淋湿，强风雨会影响体力和行动；伙伴会结合体力、性格与营地需要重新选择。</p></div>
    <button className="journal-observe-button" onClick={onObserve}><Network size={21} /><span><strong>查看伙伴的真实选择</strong><small>天气输入 · 动作分数 · 模型或规则来源</small></span><ChevronRight size={17} /></button>
    <p className="weather-footer"><Flame size={13} />不要只顾着看雨，也给火留一些木材。</p>
  </Modal>;
}
