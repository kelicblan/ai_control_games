import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, ChevronRight, Cpu, Download, ShieldCheck } from 'lucide-react';
import { useGame } from './hooks/useGame';
import { Header } from './components/Header';
import { CrewPanel } from './components/CrewPanel';
import { CampMap } from './components/CampMap';
import { CommandDock } from './components/CommandDock';
import { JourneyDialog } from './components/JourneyDialog';
import { HelpDialog } from './components/HelpDialog';
import { OutcomeDialog } from './components/OutcomeDialog';
import { DecisionPanel } from './components/DecisionPanel';
import type { ActionId, GameOptions, NpcId } from './game/types';

type Dialog = 'welcome' | 'new' | 'help' | 'outcome' | 'decisions' | null;
export default function App() {
  const controls = useGame();
  const { game, model, sendCommand } = controls;
  const [dialog, setDialog] = useState<Dialog>('welcome');
  const wasPlaying = useRef(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectNpc = useCallback((id: NpcId) => sendCommand({ type: 'select', npcId: id }), [sendCommand]);
  const assign = useCallback((action: ActionId) => {
    sendCommand({ type: 'assign', npcId: game.selectedNpc, action });
    setToast(`已向${game.npcs.find(n => n.id === game.selectedNpc)?.name}发出安排`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  }, [game.selectedNpc, game.npcs, sendCommand]);

  const openDialog = useCallback((next: Dialog) => {
    wasPlaying.current = game.status === 'playing';
    controls.pause(); setDialog(next);
  }, [game.status, controls.pause]);
  const closeDialog = useCallback(() => {
    setDialog(null);
    if (wasPlaying.current) controls.togglePause();
    wasPlaying.current = false;
  }, [controls.togglePause]);
  const startGame = (options: GameOptions) => {
    if (controls.start(options)) { setDialog(null); wasPlaying.current = false; }
  };

  useEffect(() => {
    if (game.status === 'won' || game.status === 'lost') { wasPlaying.current = false; setDialog('outcome'); }
  }, [game.status]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (dialog || event.repeat || (event.target instanceof HTMLElement && (event.target.closest('input, select, textarea') || event.target.isContentEditable))) return;
      const key = event.key.toLowerCase();
      if (key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]'))) { event.preventDefault(); controls.togglePause(); }
      if (['1', '2', '3'].includes(key)) selectNpc(game.npcs[Number(key) - 1].id);
      const mapping: Record<string, ActionId> = { q: 'wood', w: 'food', e: 'fire', r: 'rest', t: 'help' };
      if (mapping[key] && ['playing', 'paused'].includes(game.status)) assign(mapping[key]);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dialog, game.npcs, game.status, controls.togglePause, selectNpc, assign]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return <>
    <div className="game-shell" inert={dialog !== null}>
      <Header game={game} speed={controls.speed} sound={controls.sound} onPause={controls.togglePause} onSpeed={controls.setSpeed} onSound={controls.toggleSound} onHelp={() => openDialog('help')} onNew={() => openDialog('new')} />
      <main className="game-layout"><CrewPanel game={game} onSelect={selectNpc} /><div className="play-area"><CampMap game={game} onSelect={selectNpc} onAssign={assign} onResume={controls.togglePause} /><CommandDock game={game} onCommand={sendCommand} /></div></main>
      <footer className="game-footer"><div className="model-status"><span className={`status-dot ${controls.loadingModel ? 'loading' : controls.modelError ? 'error' : ''}`} /><strong>{game.mode === 'rules' ? '规则策略运行中' : controls.loadingModel ? '加载本地模型…' : controls.modelError ? '模型未就绪' : '本地模型已就绪'}</strong><span className="footer-divider" /><span className="model-detail"><Cpu size={13} />{model ? `${(model.metadata.weightBytes / 1024).toFixed(1)} KiB · 专用任务网络` : '专用任务网络'}</span></div><div className="footer-middle">{controls.offlineReady ? <span><Download size={12} />离线资源已备妥</span> : null}{controls.saveStatus ? <span><ShieldCheck size={12} />{controls.saveStatus}</span> : null}</div><button className="inspect-button" onClick={() => openDialog('decisions')}><BarChart3 size={17} />决策观察<ChevronRight size={16} /></button></footer>
      {toast && !dialog ? <div className="command-toast" role="status">{toast}</div> : null}
      {['won', 'lost'].includes(game.status) && !dialog ? <button className="reopen-outcome" onClick={() => setDialog('outcome')}>查看旅程结算<ChevronRight size={16} /></button> : null}
    </div>
    {dialog === 'welcome' || dialog === 'new' ? <JourneyDialog initial={dialog === 'new' ? game : undefined} savedGame={dialog === 'welcome' ? controls.savedGame : null} loading={controls.loadingModel} modelError={controls.modelError} onStart={startGame} onContinue={() => { if (controls.resumeSaved()) setDialog(null); }} onRetry={controls.retryModel} onClose={dialog === 'new' ? closeDialog : undefined} /> : null}
    {dialog === 'help' ? <HelpDialog onClose={closeDialog} /> : null}
    {dialog === 'outcome' ? <OutcomeDialog game={game} onRestart={() => startGame({ seed: game.seed, mode: game.mode, scenario: game.scenario, difficulty: game.difficulty })} onNew={() => setDialog('new')} onInspect={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'decisions' ? <DecisionPanel game={game} model={model} onClose={closeDialog} onExperiment={() => { wasPlaying.current = false; setDialog('new'); }} /> : null}
  </>;
}
