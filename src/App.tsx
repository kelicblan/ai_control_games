import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, House } from 'lucide-react';
import { useGame } from './hooks/useGame';
import { Header } from './components/Header';
import { CrewPanel } from './components/CrewPanel';
import { CampMap } from './components/CampMap';
import { CommandDock } from './components/CommandDock';
import { JourneyDialog } from './components/JourneyDialog';
import { HelpDialog } from './components/HelpDialog';
import { OutcomeDialog } from './components/OutcomeDialog';
import { DecisionPanel } from './components/DecisionPanel';
import { CampDrawer } from './components/CampDrawer';
import { JournalDrawer } from './components/JournalDrawer';
import { WeatherDialog } from './components/WeatherPanel';
import type { ActionId, GameOptions, NpcId, Point } from './game/types';

type Dialog = 'welcome' | 'new' | 'help' | 'outcome' | 'decisions' | 'camp' | 'journal' | 'weather' | null;
export default function App() {
  const controls = useGame();
  const { game, model, sendCommand } = controls;
  const [dialog, setDialog] = useState<Dialog>('welcome');
  const wasPlaying = useRef(false);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectNpc = useCallback((id: NpcId) => sendCommand({ type: 'select', npcId: id }), [sendCommand]);
  const assign = useCallback((action: ActionId) => {
    sendCommand({ type: 'assign', npcId: game.selectedNpc, action });
    setToast(`已向${game.npcs.find(n => n.id === game.selectedNpc)?.name}发出安排`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  }, [game.selectedNpc, game.npcs, sendCommand]);
  const moveTo = useCallback((target: Point) => sendCommand({ type: 'move', target }), [sendCommand]);

  const openDialog = useCallback((next: Dialog) => {
    dialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    wasPlaying.current = game.status === 'playing';
    controls.pause(); setDialog(next);
  }, [game.status, controls.pause]);
  const closeDialog = useCallback(() => {
    setDialog(null);
    if (wasPlaying.current) controls.togglePause();
    wasPlaying.current = false;
  }, [controls.togglePause]);
  const startGame = (options: GameOptions) => {
    if (controls.start(options)) {
      setDialog(null); wasPlaying.current = false; setToast('');
      if (toastTimer.current) { clearTimeout(toastTimer.current); toastTimer.current = null; }
    }
  };

  useEffect(() => {
    if (dialog !== null) return;
    dialogTrigger.current?.focus();
    dialogTrigger.current = null;
  }, [dialog]);
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
      <main className="game-layout" aria-label="松风营地"><CampMap game={game} dialogueLines={controls.dialogue.lines} onSelect={selectNpc} onAssign={assign} onResume={controls.togglePause} onPause={controls.pause} onMove={moveTo} onViewDirection={controls.setListenerRight} /></main>
      <Header game={game} speed={controls.speed} sound={controls.sound} soundPending={controls.soundPending} soundError={controls.soundError} onPause={controls.togglePause} onSpeed={controls.setSpeed} onSound={controls.toggleSound} onHelp={() => openDialog('help')} onWeather={() => openDialog('weather')} />
      <CrewPanel game={game} onSelect={selectNpc} />
      <CommandDock game={game} onAssign={assign} onDetails={() => openDialog('camp')} />
      <nav className="hud-utilities" aria-label="营地菜单">
        <button className="hud-utility-button" aria-label="林间手记" aria-haspopup="dialog" onClick={() => openDialog('journal')}><BookOpen size={23} /><span>手记</span></button>
        <button className="hud-utility-button" aria-label="营地选项" aria-haspopup="dialog" onClick={() => openDialog('camp')}><House size={23} /><span>营地</span></button>
      </nav>
      {toast && !dialog ? <div className="command-toast" role="status">{toast}</div> : null}
      {['won', 'lost'].includes(game.status) && !dialog ? <button className="reopen-outcome" onClick={() => setDialog('outcome')}>查看旅程结算<ChevronRight size={16} /></button> : null}
    </div>
    {dialog === 'welcome' || dialog === 'new' ? <JourneyDialog initial={dialog === 'new' ? game : undefined} savedGame={dialog === 'welcome' ? controls.savedGame : null} loading={controls.loadingModel} modelError={controls.modelError} onStart={startGame} onContinue={() => { if (controls.resumeSaved()) setDialog(null); }} onRetry={controls.retryModel} onClose={dialog === 'new' ? closeDialog : undefined} /> : null}
    {dialog === 'help' ? <HelpDialog onClose={closeDialog} /> : null}
    {dialog === 'weather' ? <WeatherDialog game={game} sound={controls.sound} soundPending={controls.soundPending} soundError={controls.soundError} onSound={controls.toggleSound} onWeather={weather => { sendCommand({ type: 'weather', weather }); closeDialog(); }} onObserve={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'camp' ? <CampDrawer game={game} dialogue={controls.dialogue} onToggleDialogue={controls.toggleDialogue} onRetryDialogue={controls.retryDialogue} saveStatus={controls.saveStatus} offlineReady={controls.offlineReady} onCommand={sendCommand} onObserve={() => setDialog('decisions')} onNew={() => setDialog('new')} onClose={closeDialog} /> : null}
    {dialog === 'journal' ? <JournalDrawer game={game} onObserve={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'outcome' ? <OutcomeDialog game={game} onRestart={() => startGame({ seed: game.seed, mode: game.mode, scenario: game.scenario, difficulty: game.difficulty })} onNew={() => setDialog('new')} onInspect={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'decisions' ? <DecisionPanel game={game} model={model} onClose={closeDialog} onExperiment={() => { wasPlaying.current = false; setDialog('new'); }} /> : null}
  </>;
}
