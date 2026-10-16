import { useEffect, useRef, useState } from 'react';
import { Check, Cpu, RefreshCw, RotateCcw } from 'lucide-react';
import { Modal } from './ui';
import { modelManager, modelName, refreshModelCatalog } from '../integrations/models/runtime';
import '../styles/model-settings.css';
import { RemoteModelSettings } from './RemoteModelSettings';
import { worldMessages } from '../gameMessages';
import { AgencySettings, type AgencySettingsAction } from './AgencySettings';
import type { GameState } from '../games/camp/simulation/types';
import '../styles/npc-memory.css';

const stages: Record<string, string> = { idle: '等待加载', download: '下载模型', verify: '校验模型文件', initialize: '初始化运行环境', load: '加载模型权重', ready: '模型已就绪', error: '加载失败', cancelled: '已在其他页面切换' };
export function GameSettingsDialog({ onClose, onReset, resetDisabled = false, game, onAgencySettings }: { onClose: () => void; onReset: () => Promise<void>; resetDisabled?: boolean; game?:GameState;onAgencySettings?:(a:AgencySettingsAction)=>Promise<unknown> }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const resetPending = useRef(false);
  const reset = async () => {
    if (resetPending.current || resetDisabled) return;
    resetPending.current = true; setResetBusy(true); setResetError('');
    try { await onReset(); }
    catch (error) { setResetError(error instanceof Error ? error.message : '重置失败，请重试。'); }
    finally { resetPending.current = false; setResetBusy(false); }
  };
  const [state, setState] = useState(() => modelManager.snapshot());
  const [catalogError, setCatalogError] = useState(''); const [catalogBusy, setCatalogBusy] = useState(false);
  useEffect(()=>{worldMessages.condition('reset',resetError);},[resetError]);
  useEffect(()=>{worldMessages.condition('model-catalog',catalogError);},[catalogError]);
  const [, tick] = useState(0);
  const refresh = async () => {
    setCatalogBusy(true); setCatalogError('');
    try { await refreshModelCatalog(); } catch (error) { setCatalogError(error instanceof Error ? error.message : '无法读取本地模型列表'); }
    finally { setCatalogBusy(false); }
  };
  useEffect(() => modelManager.subscribe(setState), []);
  useEffect(() => { void refresh(); }, []);
  const loading = !['idle', 'ready', 'error'].includes(state.mini.stage) || !['idle', 'ready', 'error', 'cancelled'].includes(state.preferred.stage);
  useEffect(() => { if (!loading) return; const timer = setInterval(() => tick(value => value + 1), 250); return () => clearInterval(timer); }, [loading]);
  const elapsed = state.preferred.startedAt ? Math.max(0, (Date.now() - state.preferred.startedAt) / 1000).toFixed(1) : '0.0';
  return <Modal title="游戏设置" className="game-settings-modal" onClose={resetBusy ? undefined : onClose}>
    <section className="game-model-settings" aria-label="NPC 对话模型">
      <div className="model-settings-heading"><Cpu size={24} /><div><h3>NPC 对话模型</h3><p>内置模型常驻兜底 · 可选模型优先使用</p></div></div>
      <div className={`model-load-state ${state.mini.stage === 'error' ? 'is-error' : ''}`} aria-live="polite" data-mini-stage={state.mini.stage}>
        <strong>MiniMind3 · 内置兜底 · {stages[state.mini.stage] ?? state.mini.stage}</strong>
        {state.mini.stage === 'ready' ? <p>{state.mini.cached ? '已复用本地模型缓存。' : '模型已加载。'}{state.mini.persistent ? '权重已保存在本地，刷新免重新下载。' : '未能持久保存，刷新可能需要重新下载。'}切换优先模型时继续保留。</p> : !['idle', 'error'].includes(state.mini.stage) ? <progress aria-label="MiniMind3 加载进度" max={1} {...(state.mini.progress === null ? {} : { value: state.mini.progress })} /> : null}
        {state.mini.error ? <button type="button" onClick={() => void modelManager.retryMini()}>重试 MiniMind3</button> : null}
        {state.mini.retryStopped ? <p>MiniMind3 已自动重试 2 次，自动重试已停止。</p> : state.mini.autoRetries > 0 ? <p>自动重试 {state.mini.autoRetries}/2</p> : null}
      </div>
      <div className="model-options" role="group" aria-label="选择对话模型">
        <button type="button" className={state.selectedId === 'minimind3' ? 'selected' : ''} aria-pressed={state.selectedId === 'minimind3'} onClick={() => void modelManager.select('minimind3')}><span><strong>不使用优先模型</strong><small>使用内置 MiniMind3</small></span>{state.selectedId === 'minimind3' ? <Check size={20} /> : null}</button>
        {modelManager.catalog().map(model => <button type="button" key={model.id} className={state.selectedId === model.id ? 'selected' : ''}
          aria-pressed={state.selectedId === model.id} disabled={model.available === false} onClick={() => void modelManager.select(model.id)}>
          <span><strong>{model.name}</strong><small>{model.backend === 'remote' ? '远程接口 · OpenAI 兼容' : `原生 llama.cpp · ${model.threads ?? '—'} CPU线程${model.bytes ? ` · ${(model.bytes / 1e6).toFixed(0)} MB` : ''}${model.available === false ? ' · 文件未安装' : ''}`}</small></span>
          {state.selectedId === model.id ? <Check size={20} /> : null}
        </button>)}
      </div>
      <div className={`model-load-state ${state.preferred.stage === 'error' ? 'is-error' : ''}`} aria-live="polite" aria-atomic="true" data-model-stage={state.stage} data-preferred-stage={state.preferred.stage}>
        <strong>优先模型：{state.selectedId === 'minimind3' ? '未选择' : `${modelName(state.selectedId)} · ${stages[state.preferred.stage] ?? state.preferred.stage}`}</strong>
        {state.selectedId !== 'minimind3' && !['idle', 'ready', 'error', 'cancelled'].includes(state.preferred.stage) ? <><progress aria-label="优先模型加载进度" max={1} {...(state.preferred.progress === null ? {} : { value: state.preferred.progress })} /><p>{state.preferred.progress === null ? '正在处理…' : `${Math.round(state.preferred.progress * 100)}%`} · 已用 {elapsed} 秒</p></> : null}
        <p>当前使用：{state.activeId ? modelName(state.activeId) : '即时回应'}。{state.selectedId !== 'minimind3' && state.activeId === 'minimind3' ? '优先模型暂不可用，已使用内置兜底。' : ''}</p>
        {state.preferred.error ? <p role="alert">{state.preferred.error}</p> : null}
        {state.preferred.error ? <button type="button" onClick={() => void modelManager.prepare(true)}>重试加载</button> : null}
      </div>
      <RemoteModelSettings />
      {game&&onAgencySettings?<AgencySettings game={game} onSave={onAgencySettings}/>:null}
      <button type="button" className="text-button model-refresh" onClick={() => void refresh()} disabled={catalogBusy}><RefreshCw size={16} />{catalogBusy ? '读取模型列表…' : '刷新本地模型列表'}</button>
      <p className="model-settings-note">打开游戏即准备 MiniMind3。优先模型加载中或异常时自动兜底，两者都不可用时使用即时回应。刷新复用权重缓存，仍需初始化运行环境。</p>
      <p className="model-settings-note">这里配置伙伴的话语生成。行动、物资与承诺仍由游戏模拟决定。</p>
    </section>
    <section className="game-reset-settings" aria-label="重置游戏">
      <h3><RotateCcw size={20} aria-hidden="true" />重置游戏</h3>
      <p>仅清除当前玩家的 NPC 记忆与对话、玩家进度、世界运行记录和全部旧存档快照，恢复初始营地。保留远程模型配置及 API Key、对话模型选择、NPC 自主设置和角色初始配置。</p>
      {confirmReset ? <div className="game-reset-confirm" role="group" aria-label="确认重置游戏">
        <strong>确定清空运行记录并重新开始吗？</strong>
        <p>此操作无法撤销，旧进度将无法通过历史快照恢复。</p>
        <div className="game-reset-actions">
          <button type="button" className="secondary-button" disabled={resetBusy} onClick={() => { setConfirmReset(false); setResetError(''); }}>取消重置</button>
          <button type="button" className="game-reset-button" disabled={resetBusy || resetDisabled} onClick={() => void reset()}>{resetBusy ? '正在清空并重置…' : '确认清空并重置'}</button>
        </div>
      </div> : <button type="button" className="game-reset-button" disabled={resetDisabled} onClick={() => setConfirmReset(true)}>重置游戏</button>}
      {resetDisabled ? <p role="status">存档服务连接就绪后可重置游戏。</p> : null}
    </section>
    <button type="button" className="primary-button" disabled={resetBusy} onClick={onClose}>返回游戏</button>
  </Modal>;
}
