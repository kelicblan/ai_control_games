import { useState } from 'react';
import { Activity, ArrowUpRight, Braces, Check, Download, HardDrive, Network, Terminal } from 'lucide-react';
import type { LoadedPolicy } from '../ai/policy';
import { ACTIONS } from '../game/types';
import type { GameState, NpcId } from '../game/types';
import { FEATURE_NAMES } from '../game/observation';
import { ACTION_LABELS, ActionIcon, EMOTION_LABELS, Modal } from './ui';
import { RecordedWeather } from './WeatherPanel';

export function DecisionPanel({ game, model, onClose, onExperiment }: { game: GameState; model: LoadedPolicy | null; onClose: () => void; onExperiment: () => void }) {
  const [npcId, setNpcId] = useState<NpcId>(game.selectedNpc);
  const [recordId, setRecordId] = useState<number | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const records = game.decisions.filter(record => record.npcId === npcId).slice().reverse();
  const record = records.find(r => r.id === recordId) ?? records[0];
  const max = record ? Math.max(...record.scores) : 1;
  const min = record ? Math.min(...record.scores) : 0;
  const decisions = game.stats.modelDecisions + game.stats.ruleDecisions + game.stats.fallbackDecisions;
  const exportRecords = () => {
    const legacyNames = [...FEATURE_NAMES.slice(0, 36)];
    legacyNames[14] = 'rain'; legacyNames[15] = 'wind';
    const payload = { exportedAt: new Date().toISOString(), model: model?.metadata ?? null,
      modelAppliesToFeatureVersion: 2, featureSchemas: { 1: legacyNames, 2: FEATURE_NAMES },
      seed: game.seed, mode: game.mode, difficulty: game.difficulty, scenario: game.scenario,
      elapsed: game.elapsed, weather: game.weather, atmosphere: game.atmosphere, shelterIntegrity: game.shelterIntegrity,
      featureNames: FEATURE_NAMES, actionOrder: ACTIONS, stats: game.stats, npcs: game.npcs,
      decisions: game.decisions, events: game.events,
      note: '分数为合法动作掩码后的softmax偏好值，不是校准过的成功概率，也不是自然语言思维过程。台词是游戏模板。历史记录保留当前局最近180条决策与80条事件。当前model元数据对应41维v2；旧36维记录保持原始输入并使用featureSchemas[1]，不代表由当前权重产生。人为天气干预记在events中。' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `campmind-${game.seed}-${game.mode}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Modal title="决策观察" onClose={onClose} className="decision-modal">
    <p className="dialog-description">从真实观测到实际动作。打开面板时旅程暂停，方便逐项检查。</p>
    <div className="model-facts"><div><Network /><span>当前决策方式</span><strong>{game.mode === 'model' ? 'CampMind 神经网络' : '规则策略对照'}</strong></div><div><HardDrive /><span>本地权重</span><strong>{model ? `${(model.metadata.weightBytes / 1024).toFixed(1)} KiB` : '尚未加载'}</strong></div><div><Activity /><span>平均决策耗时</span><strong>{decisions ? (game.stats.totalLatency / decisions).toFixed(3) : '—'} <small>ms</small></strong></div></div>
    <div className="model-explanation"><Terminal size={17} /><p>这是 <strong>{model?.metadata.parameterCount.toLocaleString() ?? '—'} 参数的专用任务网络</strong>，在本地运行。它学习合成状态下的教师策略，输出任务与情绪类别；显示的台词来自情绪模板。它不是聊天大模型，也不预设比规则更强。</p></div>
    <div className="decision-filters"><label>观察伙伴<select value={npcId} onChange={e => { setNpcId(e.target.value as NpcId); setRecordId(null); }}>{game.npcs.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>决策记录<select value={record?.id ?? ''} onChange={e => setRecordId(Number(e.target.value))}>{records.length ? records.map(r => <option key={r.id} value={r.id}>#{r.id} · {r.time.toFixed(1)}s · {ACTION_LABELS[r.action]}</option>) : <option value="">暂无记录</option>}</select></label></div>
    {record ? <>
      <RecordedWeather record={record} />
      <div className={`executed-decision ${record.source === 'fallback' ? 'is-fallback' : ''}`}><ActionIcon action={record.action} size={26} /><div><span>实际执行</span><strong>{ACTION_LABELS[record.action]}</strong></div><span className="decision-emotion">{EMOTION_LABELS[record.emotion]}</span><span className="decision-source">{record.source === 'model' ? '真实模型输出' : record.source === 'rules' ? '规则输出' : '异常回退'} · {record.latencyMs.toFixed(3)} ms</span></div>
      {record.reason ? <p className="decision-reason">{record.reason}</p> : null}
      <div className="scores-heading"><h3>候选动作偏好</h3><span>归一化权重，非成功概率</span></div><div className="action-scores">{ACTIONS.map((action, i) => <div key={action} className={`score-row ${!record.allowed.includes(action) ? 'masked' : ''} ${record.action === action ? 'chosen' : ''}`}><span><ActionIcon action={action} size={14} />{ACTION_LABELS[action]}</span><span className="score-track"><i style={{ width: `${record.allowed.includes(action) ? 6 + 94 * ((record.scores[i] ?? 0) - min) / (max - min || 1) : 0}%` }} /></span><code>{record.allowed.includes(action) ? (record.scores[i] ?? 0).toFixed(3) : '不可执行'}</code>{record.action === action ? <Check size={14} /> : <span />}</div>)}</div>
      <button className="text-button feature-toggle" onClick={() => setShowFeatures(!showFeatures)} aria-expanded={showFeatures}><Braces size={16} />{showFeatures ? '收起' : '查看'} {record.features.length} 维真实输入<span>{showFeatures ? '−' : '+'}</span></button>
      {showFeatures ? <div className="feature-grid">{record.features.map((value, i) => <div key={i}><span>{record.features.length === 36 && (i === 14 || i === 15) ? i === 14 ? 'rain (v1)' : 'wind (v1)' : FEATURE_NAMES[i] ?? `feature_${i}`}</span><code>{value.toFixed(4)}</code></div>)}</div> : null}
    </> : <div className="decisions-empty"><Network size={34} /><h3>还没有做出第一个决定</h3><p>开始旅程，等伙伴选择任务后，就可以在这里检查真实推理结果。</p></div>}
    <div className="experiment-summary"><span>种子 <strong>{game.seed}</strong></span><span>模型 {game.stats.modelDecisions}</span><span>规则 {game.stats.ruleDecisions}</span><span className={game.stats.fallbackDecisions ? 'warning-text' : ''}>回退 {game.stats.fallbackDecisions}</span></div>
    <div className="decision-footer"><button className="secondary-button" onClick={exportRecords}><Download size={16} />导出真实记录</button><button className="primary-button" onClick={onExperiment}>同一种子，新一轮对照 <ArrowUpRight size={17} /></button></div>
    <p className="fine-print">切换模型会重开本局。对照需保持相同引擎版本、种子、设置与指令时机；主动改变天气时，也要保持相同的触发顺序和时刻。</p>
  </Modal>;
}
