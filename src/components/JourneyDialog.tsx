import { useState } from 'react';
import { ArrowRight, BrainCircuit, Check, Flame, Footprints, Leaf, Shuffle, Sparkles, Users } from 'lucide-react';
import type { GameOptions, GameState, PolicyMode, ScenarioId, Difficulty } from '../games/camp/simulation/types';
import { Modal } from './ui';

export interface JourneyDraft { difficulty: Difficulty; mode: PolicyMode; scenario: ScenarioId; seed: string; advanced: boolean }
interface Props { initial?: GameState; savedGame?: GameState | null; loading: boolean; modelError: string; onStart: (options: GameOptions) => void; onContinue?: () => void; onRetry: () => void; onClose?: () => void; onSettings?: (draft: JourneyDraft) => void; onGameSettings?: (draft: JourneyDraft) => void; initialDraft?: JourneyDraft; starting?: boolean; settingsError?: string; onStartDefaults?: (options: GameOptions) => void; worldReady?: boolean; worldError?: string }
export function JourneyDialog({ initial, savedGame, loading, modelError, onStart, onContinue, onRetry, onClose, onSettings, onGameSettings, initialDraft, starting = false, settingsError = '', onStartDefaults, worldReady = true, worldError = '' }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDraft?.difficulty ?? initial?.difficulty ?? 'cozy');
  const [mode, setMode] = useState<PolicyMode>(initialDraft?.mode ?? initial?.mode ?? 'model');
  const [scenario, setScenario] = useState<ScenarioId>(initialDraft?.scenario ?? initial?.scenario ?? 'standard');
  const [seed, setSeed] = useState(initialDraft?.seed ?? String(initial?.seed ?? 64138));
  const [advanced, setAdvanced] = useState(initialDraft?.advanced ?? false);
  const validSeed = /^\d{1,10}$/.test(seed) && Number(seed) >= 1 && Number(seed) <= 4294967295;
  const blocked = starting || mode === 'model' && (loading || !!modelError);
  return <Modal title={initial ? '开启新的旅程' : '今晚，我们一起留下来。'} onClose={onClose} className="journey-modal">
    <div className="journey-art"><div className="journey-flame"><Flame size={38} fill="currentColor" /></div><span>松风营地 · 持续生存的荒野故事</span></div>
    <p className="journey-lead">九个伙伴，九种脾气，一座共同的村寨。<br />分配工作，照顾彼此，在昼夜交替中建设营地。</p>
    <div className="journey-steps"><div><Users size={19} /><strong>认识伙伴</strong><span>每个人都有自己的性格</span></div><div><Footprints size={19} /><strong>一起劳作</strong><span>采集、休息，也要互相照顾</span></div><div><Flame size={20} /><strong>建设营地</strong><span>储备物资，在昼夜中持续生存</span></div></div>
    <fieldset className="difficulty-options" disabled={starting}><legend>选择村寨生活节奏</legend>{([{ id: 'cozy', title: '悠然村居', detail: '更充足的物资，适合熟悉村寨', icon: Leaf }, { id: 'normal', title: '村寨求生', detail: '先保口粮，再安排日常分工', icon: Flame }, { id: 'hard', title: '严酷生存', detail: '更大的消耗，考验补给与换班', icon: Sparkles }] as const).map(option => <button key={option.id} className={difficulty === option.id ? 'selected' : ''} onClick={() => setDifficulty(option.id)} aria-pressed={difficulty === option.id}><option.icon size={18} /><div><strong>{option.title}</strong><small>{option.detail}</small></div>{difficulty === option.id ? <Check size={16} /> : null}</button>)}</fieldset>
    <button disabled={starting} className="text-button experiment-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}><BrainCircuit size={15} />{advanced ? '收起模型与场景设置' : '模型与场景设置'}<span>{advanced ? '−' : '+'}</span></button>
    {advanced ? <div className="experiment-settings"><label>NPC 决策方式<select disabled={starting} value={mode} onChange={e => setMode(e.target.value as PolicyMode)}><option value="model">本地神经网络 · CampMind</option><option value="rules">规则策略 · 对照组</option></select></label><label>初始场景<select disabled={starting} value={scenario} onChange={e => setScenario(e.target.value as ScenarioId)}><option value="standard">松风营地 · 均衡开局</option><option value="storm">风雨营地 · 生存压力</option><option value="conflict">分歧时刻 · 疲劳与指令</option></select></label><label className="seed-field">世界种子<span><input disabled={starting} inputMode="numeric" value={seed} onChange={e => setSeed(e.target.value)} aria-invalid={!validSeed} /><button disabled={starting} onClick={() => setSeed(String(1 + crypto.getRandomValues(new Uint32Array(1))[0] % 4294967294))} title="生成新种子" aria-label="生成新种子"><Shuffle size={16} /></button></span></label><p>同一种子和场景可重现天气事件。两种策略使用相同的观测与合法动作。</p></div> : null}
    {modelError ? <div className="model-load-error"><button onClick={onRetry}>重新加载</button><button onClick={() => { setMode('rules'); setAdvanced(true); }}>使用规则模式体验</button></div> : null}
    {onSettings ? <button type="button" className="secondary-button" onClick={() => onSettings({ difficulty, mode, scenario, seed, advanced })} disabled={starting}>角色初始设置 · 性格 / 体能 / 技能</button> : null}
    {onGameSettings ? <button type="button" className="secondary-button" onClick={() => onGameSettings({ difficulty, mode, scenario, seed, advanced })} disabled={starting}>游戏设置 · 对话模型</button> : null}
    {settingsError ? <div className="model-load-error"><button disabled={starting || blocked || !validSeed} onClick={() => onStartDefaults?.({ difficulty, mode, scenario, seed: Number(seed) })}>使用内置初值开始</button></div> : null}
    {!worldReady && !worldError ? <p role="status">正在读取数据库存档…</p> : null}
    {savedGame && onContinue ? <button className="primary-button continue-button" disabled={!worldReady || starting || savedGame.mode === 'model' && (loading || !!modelError)} onClick={onContinue}>继续上一次旅程 <span>{Math.floor(savedGame.elapsed / 60)} 分 {Math.floor(savedGame.elapsed % 60)} 秒</span><ArrowRight size={18} /></button> : null}
    <button className={savedGame ? 'secondary-button start-button' : 'primary-button start-button'} onClick={() => onStart({ difficulty, mode, scenario, seed: Number(seed) })} disabled={!worldReady || blocked || !validSeed}>{starting ? '正在准备并保存村寨…' : loading && mode === 'model' ? '正在加载本地模型…' : initial ? '开始村寨生活' : savedGame ? '重新开始一段村寨生活' : '进入村寨'}<ArrowRight size={18} /></button>
    <p className="journey-footnote">{initial || savedGame ? '新旅程将替换当前存档。' : '自动保存进度 · 支持鼠标与键盘'}<span>本地任务策略网络，无需 API 密钥</span></p>
  </Modal>;
}
