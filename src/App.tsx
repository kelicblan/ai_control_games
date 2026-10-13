import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, House, MessageCircle } from 'lucide-react';
import { useGame } from './hooks/useGame';
import { Header } from './components/Header';
import { CrewPanel } from './components/CrewPanel';
import { CampMap } from './components/CampMap';
import { CommandDock } from './components/CommandDock';
import { JourneyDialog, type JourneyDraft } from './components/JourneyDialog';
import { HelpDialog } from './components/HelpDialog';
import { OutcomeDialog } from './components/OutcomeDialog';
import { DecisionPanel } from './components/DecisionPanel';
import { CampDrawer } from './components/CampDrawer';
import { JournalDrawer } from './components/JournalDrawer';
import { WeatherDialog } from './components/WeatherPanel';
import { NpcSettingsDialog } from './games/camp/settings/SettingsDialog';
import { campSettingsRepository } from './games/camp/settings/repository';
import { SocialDialog } from './components/SocialDialog';
import type { SocialTopic } from './games/camp/simulation/social-types';
import './styles/social.css';
import type { ActionId, GameOptions, NpcId, Point } from './games/camp/simulation/types';

type Dialog = 'welcome' | 'new' | 'help' | 'outcome' | 'decisions' | 'camp' | 'journal' | 'weather' | 'social' | 'settings' | null;
export default function App() {
  const controls = useGame();
  const { game, model, sendCommand } = controls;
  const [dialog, setDialog] = useState<Dialog>('welcome');
  const wasPlaying = useRef(false);
  const settingsReturn = useRef<Dialog>(null);
  const journeyDraft = useRef<JourneyDraft | undefined>(undefined);
  const startGeneration = useRef(0), startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const cancelStart = useCallback(() => {
    startGeneration.current++; startingRef.current = false; setStarting(false); setSettingsError('');
  }, []);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const [socialThreadId, setSocialThreadId] = useState<number | null>(null);
  const [socialNpcId, setSocialNpcId] = useState<NpcId>(game.selectedNpc);
  const socialThread = socialThreadId !== null
    ? game.social.threads.find(thread => thread.id === socialThreadId)
    : game.social.threads.slice().reverse().find(thread => thread.initiator === socialNpcId);
  const pendingThreads = game.social.threads.filter(thread => thread.status === 'open');
  const request = pendingThreads[0];
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
    cancelStart();
    setDialog(null);
    if (wasPlaying.current) controls.togglePause();
    wasPlaying.current = false;
  }, [controls.togglePause, cancelStart]);
  const openSettings = () => {
    cancelStart(); settingsReturn.current = dialog;
    if (dialog === null) openDialog('settings'); else setDialog('settings');
  };
  const showNewJourney = () => { journeyDraft.current = undefined; setDialog('new'); };
  const closeSettings = () => {
    if (settingsReturn.current !== null) setDialog(settingsReturn.current);
    else closeDialog();
  };
  const talk = useCallback((topic: SocialTopic = 'checkin') => {
    const npcId = socialThread?.initiator ?? game.selectedNpc;
    setSocialNpcId(npcId); setSocialThreadId(null);
    sendCommand({ type: 'social-open', npcId, topic });
    if (dialog === null) openDialog('social'); else setDialog('social');
  }, [socialThread?.initiator, game.selectedNpc, sendCommand, dialog, openDialog]);
  const finishStart = (options: GameOptions) => {
    if (controls.start(options)) {
      journeyDraft.current = undefined;
      setDialog(null); wasPlaying.current = false; setToast(''); setSettingsError('');
      if (toastTimer.current) { clearTimeout(toastTimer.current); toastTimer.current = null; }
    }
  };
  /** 先完成配置读取，再启动新局；取消或继续旧档后，迟到的读取不得清掉旧进度。 */
  const startGame = async (options: GameOptions) => {
    if (startingRef.current) return;
    startingRef.current = true; setStarting(true); setSettingsError('');
    const token = ++startGeneration.current;
    try {
      const saved = await campSettingsRepository.load();
      if (token !== startGeneration.current) return;
      finishStart({ ...options, npcSettings: saved.document });
    } catch (error) {
      if (token !== startGeneration.current) return;
      setSettingsError(error instanceof Error ? error.message : '无法读取角色配置。');
      // 重开结算页失败时也回到可重试的开局表单，不会先清除存档。
      if (dialog !== 'welcome' && dialog !== 'new') setDialog('new');
    } finally {
      if (token === startGeneration.current) { startingRef.current = false; setStarting(false); }
    }
  };

  useEffect(() => {
    controls.setConversationThread(dialog === 'social' ? socialThread?.id ?? null : null);
    return () => controls.setConversationThread(null);
  }, [dialog, socialThread?.id, controls.setConversationThread]);
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
      if (/^[1-5]$/.test(key) && game.npcs[Number(key) - 1]) selectNpc(game.npcs[Number(key) - 1].id);
      const mapping: Record<string, ActionId> = { q: 'wood', w: 'food', e: 'fire', r: 'rest', t: 'help' };
      if (mapping[key] && ['playing', 'paused'].includes(game.status)) assign(mapping[key]);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dialog, game.npcs, game.status, controls.togglePause, selectNpc, assign]);
  useEffect(() => () => { startGeneration.current++; if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return <>
    <div className="game-shell" inert={dialog !== null}>
      <main className="game-layout" aria-label="松风营地"><CampMap onReady={controls.prepareDialogue} game={game} dialogueLines={controls.dialogue.lines} onSelect={selectNpc} onAssign={assign} onResume={controls.togglePause} onPause={controls.pause} onMove={moveTo} onViewDirection={controls.setListenerRight} /></main>
      <Header game={game} speed={controls.speed} sound={controls.sound} soundPending={controls.soundPending} soundError={controls.soundError} onPause={controls.togglePause} onSpeed={controls.setSpeed} onSound={controls.toggleSound} onHelp={() => openDialog('help')} onWeather={() => openDialog('weather')} />
      <CrewPanel game={game} onSelect={selectNpc} />
      <CommandDock game={game} onAssign={assign} onDetails={() => openDialog('camp')} />
      {request && ['playing', 'paused'].includes(game.status) ? <button className="social-request-chip" aria-label={`回应伙伴请求：${game.npcs.find(npc => npc.id === request.initiator)?.name} · ${request.title}`} aria-haspopup="dialog" onClick={() => { setSocialThreadId(request.id); setSocialNpcId(request.initiator); openDialog('social'); }}><MessageCircle size={17} /><span><strong>{game.npcs.find(npc => npc.id === request.initiator)?.name} 想和你商量</strong><small>{request.title}</small></span>{pendingThreads.length > 1 ? <b>{pendingThreads.length}</b> : null}<ChevronRight size={14} /></button> : null}
      <nav className="hud-utilities" aria-label="营地菜单">
        <button className="hud-utility-button" title="林间手记" aria-label="林间手记" aria-haspopup="dialog" onClick={() => openDialog('journal')}><BookOpen size={23} /><span>手记</span></button>
        <button className="hud-utility-button" title="营地选项" aria-label="营地选项" aria-haspopup="dialog" onClick={() => openDialog('camp')}><House size={23} /><span>营地</span></button>
      </nav>
      {toast && !dialog ? <div className="command-toast" role="status">{toast}</div> : null}
      {['won', 'lost'].includes(game.status) && !dialog ? <button className="reopen-outcome" onClick={() => setDialog('outcome')}>查看旅程结算<ChevronRight size={16} /></button> : null}
    </div>
    {dialog === 'welcome' || dialog === 'new' ? <JourneyDialog initial={dialog === 'new' ? game : undefined} savedGame={dialog === 'welcome' ? controls.savedGame : null} loading={controls.loadingModel} modelError={controls.modelError} onStart={startGame} initialDraft={journeyDraft.current} onSettings={draft => { journeyDraft.current = draft; openSettings(); }} starting={starting} settingsError={settingsError} onStartDefaults={options => { cancelStart(); finishStart(options); }} onContinue={() => { cancelStart(); if (controls.resumeSaved()) setDialog(null); }} onRetry={controls.retryModel} onClose={dialog === 'new' ? closeDialog : undefined} /> : null}
    {dialog === 'settings' ? <NpcSettingsDialog onClose={closeSettings} /> : null}
    {dialog === 'help' ? <HelpDialog onClose={closeDialog} /> : null}
    {dialog === 'weather' ? <WeatherDialog game={game} sound={controls.sound} soundPending={controls.soundPending} soundError={controls.soundError} onSound={controls.toggleSound} onWeather={weather => { sendCommand({ type: 'weather', weather }); closeDialog(); }} onObserve={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'camp' ? <CampDrawer onSettings={openSettings} game={game} dialogue={controls.dialogue} onToggleDialogue={controls.toggleDialogue} onRetryDialogue={controls.retryDialogue} saveStatus={controls.saveStatus} offlineReady={controls.offlineReady} onCommand={sendCommand} onObserve={() => setDialog('decisions')} onTalk={() => { setSocialThreadId(null); setSocialNpcId(game.selectedNpc); sendCommand({ type: 'social-open', npcId: game.selectedNpc, topic: 'checkin' }); setDialog('social'); }} onNew={showNewJourney} onClose={closeDialog} /> : null}
    {dialog === 'social' ? <SocialDialog game={game} thread={socialThread} npcId={socialNpcId} onCommand={sendCommand} onTopic={talk} onClose={closeDialog} /> : null}
    {dialog === 'journal' ? <JournalDrawer game={game} onObserve={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'outcome' ? <OutcomeDialog game={game} onRestart={() => startGame({ seed: game.seed, mode: game.mode, scenario: game.scenario, difficulty: game.difficulty })} onNew={showNewJourney} onInspect={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'decisions' ? <DecisionPanel game={game} model={model} onClose={closeDialog} onExperiment={() => { wasPlaying.current = false; showNewJourney(); }} /> : null}
  </>;
}
