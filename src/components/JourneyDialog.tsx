import { useState } from 'react';
import { ArrowRight, BrainCircuit, Check, Flame, Footprints, Leaf, Shuffle, Sparkles, Users } from 'lucide-react';
import type { GameOptions, GameState, PolicyMode, ScenarioId, Difficulty } from '../games/camp/simulation/types';
import { Modal } from './ui';

interface Props { initial?: GameState; savedGame?: GameState | null; loading: boolean; modelError: string; onStart: (options: GameOptions) => void; onContinue?: () => void; onRetry: () => void; onClose?: () => void }
export function JourneyDialog({ initial, savedGame, loading, modelError, onStart, onContinue, onRetry, onClose }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'cozy');
  const [mode, setMode] = useState<PolicyMode>(initial?.mode ?? 'model');
  const [scenario, setScenario] = useState<ScenarioId>(initial?.scenario ?? 'standard');
  const [seed, setSeed] = useState(String(initial?.seed ?? 64138));
  const [advanced, setAdvanced] = useState(false);
  const validSeed = /^\d{1,10}$/.test(seed) && Number(seed) >= 1 && Number(seed) <= 4294967295;
  const blocked = mode === 'model' && (loading || !!modelError);
  return <Modal title={initial ? '开启新的旅程' : '今晚，我们一起留下来。'} onClose={onClose} className="journey-modal">
    <div className="journey-art"><div className="journey-flame"><Flame size={38} fill="currentColor" /></div><span>松风营地 · 4 分钟的荒野故事</span></div>
    <p className="journey-lead">五个伙伴，一小堆篝火。<br />分配工作，照顾彼此，平安等到天亮。</p>
    <div className="journey-steps"><div><Users size={19} /><strong>认识伙伴</strong><span>每个人都有自己的性格</span></div><div><Footprints size={19} /><strong>一起劳作</strong><span>采集、休息，也要互相照顾</span></div><div><Flame size={20} /><strong>守住温暖</strong><span>结束前让五人回到火堆旁</span></div></div>
    <fieldset className="difficulty-options"><legend>选择旅程节奏</legend>{([{ id: 'cozy', title: '悠然露营', detail: '更充足的物资，适合初次相遇', icon: Leaf }, { id: 'normal', title: '荒野求生', detail: '资源有限，每一个安排都重要', icon: Flame }, { id: 'hard', title: '凛夜挑战', detail: '更大的消耗，考验团队默契', icon: Sparkles }] as const).map(option => <button key={option.id} className={difficulty === option.id ? 'selected' : ''} onClick={() => setDifficulty(option.id)} aria-pressed={difficulty === option.id}><option.icon size={18} /><div><strong>{option.title}</strong><small>{option.detail}</small></div>{difficulty === option.id ? <Check size={16} /> : null}</button>)}</fieldset>
    <button className="text-button experiment-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}><BrainCircuit size={15} />{advanced ? '收起模型与场景设置' : '模型与场景设置'}<span>{advanced ? '−' : '+'}</span></button>
    {advanced ? <div className="experiment-settings"><label>NPC 决策方式<select value={mode} onChange={e => setMode(e.target.value as PolicyMode)}><option value="model">本地神经网络 · CampMind</option><option value="rules">规则策略 · 对照组</option></select></label><label>初始场景<select value={scenario} onChange={e => setScenario(e.target.value as ScenarioId)}><option value="standard">松风营地 · 均衡开局</option><option value="storm">风雨营地 · 生存压力</option><option value="conflict">分歧时刻 · 疲劳与指令</option></select></label><label className="seed-field">世界种子<span><input inputMode="numeric" value={seed} onChange={e => setSeed(e.target.value)} aria-invalid={!validSeed} /><button onClick={() => setSeed(String(1 + crypto.getRandomValues(new Uint32Array(1))[0] % 4294967294))} title="生成新种子" aria-label="生成新种子"><Shuffle size={16} /></button></span></label><p>同一种子和场景可重现天气事件。两种策略使用相同的观测与合法动作。</p></div> : null}
    {modelError ? <div className="model-load-error" role="alert">模型加载失败：{modelError}<button onClick={onRetry}>重新加载</button><button onClick={() => { setMode('rules'); setAdvanced(true); }}>使用规则模式体验</button></div> : null}
    {savedGame && onContinue ? <button className="primary-button continue-button" disabled={savedGame.mode === 'model' && (loading || !!modelError)} onClick={onContinue}>继续上一次旅程 <span>{Math.floor(savedGame.elapsed / 60)} 分 {Math.floor(savedGame.elapsed % 60)} 秒</span><ArrowRight size={18} /></button> : null}
    <button className={savedGame ? 'secondary-button start-button' : 'primary-button start-button'} onClick={() => onStart({ difficulty, mode, scenario, seed: Number(seed) })} disabled={blocked || !validSeed}>{loading && mode === 'model' ? '正在加载本地模型…' : initial ? '出发，开始新的一局' : savedGame ? '重新开始一段旅程' : '点亮篝火，出发吧'}<ArrowRight size={18} /></button>
    <p className="journey-footnote">{initial || savedGame ? '新旅程将替换当前存档。' : '自动保存进度 · 支持键盘与触摸'}<span>本地任务策略网络，无需 API 密钥</span></p>
  </Modal>;
}
