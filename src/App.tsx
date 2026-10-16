import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, House, MessageCircle } from 'lucide-react';
import { useGame } from './hooks/useGame';
import { Header } from './components/Header';
import { CrewPanel } from './components/CrewPanel';
import { CampMap } from './components/CampMap';
import { CommandDock } from './components/CommandDock';
import { JourneyDialog, type JourneyDraft } from './components/JourneyDialog';
import { HelpDialog } from './components/HelpDialog';
import { DecisionPanel } from './components/DecisionPanel';
import { CampDrawer } from './components/CampDrawer';
import { JournalDrawer } from './components/JournalDrawer';
import { WeatherDialog } from './components/WeatherPanel';
import { NpcSettingsDialog } from './games/camp/settings/SettingsDialog';
import { campSettingsRepository } from './games/camp/settings/repository';
import { SocialDialog } from './components/SocialDialog';
import { GameSettingsDialog } from './components/GameSettingsDialog';
import { WorldChannel } from './components/WorldChannel';
import { ConversationHistoryDialog } from './components/ConversationHistoryDialog';
import { worldMessages } from './gameMessages';
import { modelManager } from './integrations/models/runtime';
import { NpcDispatchIntent } from './npcDispatchIntent';
import type { SocialTopic } from './games/camp/simulation/social-types';
import './styles/social.css';
import type { ActionId, GameOptions, NpcId, Point } from './games/camp/simulation/types';

type Dialog = 'loading' | 'welcome' | 'new' | 'help' | 'decisions' | 'camp' | 'journal' | 'weather' | 'social' | 'settings' | 'game-settings' | 'conversation-history' | null;
export default function App() {
  const controls = useGame();
  const { game, model, sendCommand } = controls;
  const [dialog, setDialog] = useState<Dialog>('loading');
  useEffect(()=>{
    if(controls.worldReady)setDialog(current=>current==='loading'?(controls.savedGame?null:'welcome'):current);
  },[controls.worldReady,controls.savedGame]);
  const wasPlaying = useRef(false);
  const settingsReturn = useRef<Dialog>(null);
  const gameSettingsReturn = useRef<Dialog>(null);
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
  const [toastId, setToastId] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlledNpcId,setControlledNpcId]=useState<NpcId|null>(null);
  const dispatchIntent=useRef(new NpcDispatchIntent());
  const [dispatchNpcId,setDispatchNpcId]=useState<NpcId|null>(null);
  const [godView,setGodView]=useState(true);
  const cancelDispatch=useCallback(()=>{dispatchIntent.current.cancel();setDispatchNpcId(null);},[]);
  const npcControlsVisible=controlledNpcId===game.selectedNpc;
  const dispatchActive=npcControlsVisible&&dispatchNpcId===game.selectedNpc;
  useEffect(()=>{cancelDispatch();},[game.selectedNpc,npcControlsVisible,dialog,game.status,controls.worldGeneration,cancelDispatch]);
  const changeView=useCallback((mode:'god'|'lord')=>{cancelDispatch();setGodView(mode==='god');},[cancelDispatch]);
  const toggleDispatch=useCallback(()=>{
    if(dispatchActive){cancelDispatch();return;}
    if(!npcControlsVisible||!godView||dialog||!game.npcs.find(n=>n.id===game.selectedNpc)?.alive||!['playing','paused'].includes(game.status))return;
    dispatchIntent.current.arm(game.selectedNpc);setDispatchNpcId(game.selectedNpc);
  },[dispatchActive,cancelDispatch,npcControlsVisible,godView,dialog,game.npcs,game.selectedNpc,game.status]);
  useEffect(()=>{setControlledNpcId(null);},[controls.worldGeneration]);
  const selectNpc = useCallback((id: NpcId) => {
    cancelDispatch();
    setControlledNpcId(null);
    sendCommand({ type: 'select', npcId: id });
  }, [sendCommand,cancelDispatch]);
  const selectNpcFromPortrait=useCallback((id:NpcId)=>{
    cancelDispatch();
    setControlledNpcId(current=>current===id?null:id);
    sendCommand({type:'select',npcId:id});
  },[sendCommand,cancelDispatch]);
  const assign = useCallback((action: ActionId) => {
    cancelDispatch();
    if(!npcControlsVisible)return;
    sendCommand({ type: 'assign', npcId: game.selectedNpc, action });
    setToast(`已向${game.npcs.find(n => n.id === game.selectedNpc)?.name}发出安排`);
    setToastId(value => value + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  }, [game.selectedNpc, game.npcs, sendCommand,npcControlsVisible,cancelDispatch]);
  const moveTo = useCallback((target: Point) => {
    if(!npcControlsVisible||!godView||dialog||!game.npcs.find(n=>n.id===game.selectedNpc)?.alive||!['playing','paused'].includes(game.status)){cancelDispatch();return;}
    const command=dispatchIntent.current.take(game.selectedNpc,target);
    setDispatchNpcId(null);
    if(command)sendCommand(command);
  }, [sendCommand,npcControlsVisible,godView,dialog,game.selectedNpc,game.npcs,game.status,cancelDispatch]);

  const openDialog = useCallback((next: Dialog) => {
    dialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    wasPlaying.current = game.status === 'playing';
    controls.pause(); setDialog(next);
  }, [game.status, controls.pause]);
  const closeDialog = useCallback(() => {
    cancelStart();
    setDialog(null);
    if (wasPlaying.current) controls.resume();
    wasPlaying.current = false;
  }, [controls.resume, cancelStart]);
  const openSettings = () => {
    cancelStart(); settingsReturn.current = dialog;
    if (dialog === null) openDialog('settings'); else setDialog('settings');
  };
  const showNewJourney = () => { journeyDraft.current = undefined; setDialog('new'); };
  const closeSettings = () => {
    if (settingsReturn.current !== null) setDialog(settingsReturn.current);
    else closeDialog();
  };
  const openGameSettings = () => {
    gameSettingsReturn.current = dialog;
    if (dialog === null) openDialog('game-settings'); else setDialog('game-settings');
  };
  const closeGameSettings = () => {
    if (gameSettingsReturn.current !== null) setDialog(gameSettingsReturn.current); else closeDialog();
  };
  const resetGame = async () => {
    setControlledNpcId(null);
    cancelStart();
    const saved = await campSettingsRepository.load();
    await controls.reset(saved.document);
    journeyDraft.current = undefined;
    settingsReturn.current = null; gameSettingsReturn.current = null;
    wasPlaying.current = false;
    setSocialThreadId(null); setSocialNpcId('azhuang'); setToast('');
    if (toastTimer.current) { clearTimeout(toastTimer.current); toastTimer.current = null; }
    setDialog(null);
  };
  const talk = useCallback((topic: SocialTopic = 'checkin') => {
    const npcId = dialog==='social'?socialNpcId:game.selectedNpc;
    setSocialNpcId(npcId); setSocialThreadId(null);
    sendCommand({ type: 'social-open', npcId, topic });
    if (dialog === null) openDialog('social'); else setDialog('social');
  }, [socialNpcId, game.selectedNpc, sendCommand, dialog, openDialog]);
  const finishStart = async (options: GameOptions) => {
    if (await controls.start(options)) {
      setControlledNpcId(null);
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
      await finishStart({ ...options, npcSettings: saved.document });
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
    const handler = (event: KeyboardEvent) => {
      if (dialog || event.repeat || (event.target instanceof HTMLElement && (event.target.closest('input, select, textarea') || event.target.isContentEditable))) return;
      const key = event.key.toLowerCase();
      if(key==='escape'){cancelDispatch();setControlledNpcId(null);return;}
      if (key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]'))) { event.preventDefault(); controls.togglePause(); }
      if (/^[1-9]$/.test(key) && game.npcs[Number(key) - 1]) selectNpc(game.npcs[Number(key) - 1].id);
      const mapping: Record<string, ActionId> = { q: 'wood', w: 'food', r: 'rest', t: 'help' };
      if (!event.defaultPrevented && mapping[key] && ['playing', 'paused'].includes(game.status)) assign(mapping[key]);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dialog, game.npcs, game.status, controls.togglePause, selectNpc, assign,cancelDispatch]);
  useEffect(() => () => { startGeneration.current++; if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  useEffect(()=>{
    worldMessages.condition('world',controls.worldError?`存档连接异常：${controls.worldError}。正在重连。`:'');
    worldMessages.condition('dialogue',controls.dialogue.modelRetryStopped?`${controls.dialogue.modelName??'对话模型'}加载失败，自动重试已停止，伙伴暂用即时回应。`:'');
    worldMessages.condition('audio',controls.soundError);
    worldMessages.condition('policy',controls.modelError);
    worldMessages.condition('settings',settingsError);
  },[controls.worldError,controls.dialogue.modelRetryStopped,controls.dialogue.modelName,controls.soundError,controls.modelError,settingsError]);
  useEffect(()=>{worldMessages.condition('command-feedback',toast,'info',game.elapsed);},[toast,toastId,game.elapsed]);
  useEffect(()=>modelManager.subscribe(state=>{
    const preferredReady = state.preferred.stage === 'ready';
    worldMessages.condition('mini-model',state.mini.error ? preferredReady ? `备用 MiniMind3 暂不可用，当前优先模型继续使用：${state.mini.error}` : `MiniMind3：${state.mini.error}` : '', preferredReady ? 'warning' : 'error');
    worldMessages.condition('preferred-model',state.preferred.error?`对话模型：${state.preferred.error}`:'');
    worldMessages.condition('model-storage',state.storageError??'','warning');
  }),[]);
  useEffect(()=>{
    const error=(event:ErrorEvent)=>worldMessages.append('error',event.message||'页面运行出错');
    const rejection=(event:PromiseRejectionEvent)=>worldMessages.append('error',event.reason instanceof Error?event.reason.message:'异步操作失败');
    window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejection);
    return()=>{window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection);};
  },[]);

  return <>
    <div className="game-shell" inert={dialog !== null}>
      <main className="game-layout" aria-label="松风营地"><CampMap dispatchActive={dispatchActive} onViewModeChange={changeView} npcCommandsEnabled={npcControlsVisible} resetVersion={controls.worldGeneration} onCommand={sendCommand} onReady={controls.prepareDialogue} game={game} dialogueLines={controls.dialogue.lines} onSelect={selectNpc} onAssign={assign} onResume={controls.togglePause} onPause={controls.pause} onMove={moveTo} onViewDirection={controls.setListenerRight} onLordInput={controls.sendLordInput} /></main>
      <Header game={game} speed={controls.speed} sound={controls.sound} soundPending={controls.soundPending} onPause={controls.togglePause} onSpeed={controls.setSpeed} onSound={controls.toggleSound} onHelp={() => openDialog('help')} onWeather={() => openDialog('weather')} onSettings={openGameSettings} />
      <CrewPanel game={game} onSelect={selectNpcFromPortrait} controlsVisible={npcControlsVisible} />
      {npcControlsVisible?<CommandDock game={game} onAssign={assign} onDispatch={toggleDispatch} dispatchActive={dispatchActive} dispatchEnabled={godView} onHunt={()=>{cancelDispatch();sendCommand({type:'hunt',npcId:game.selectedNpc});}} onDetails={() => openDialog('camp')} />:null}
      {request && ['playing', 'paused'].includes(game.status) ? <button className="social-request-chip" aria-label={`回应伙伴请求：${game.npcs.find(npc => npc.id === request.initiator)?.name} · ${request.title}`} aria-haspopup="dialog" onClick={() => { setSocialThreadId(request.id); setSocialNpcId(request.initiator); openDialog('social'); }}><MessageCircle size={17} /><span><strong>{game.npcs.find(npc => npc.id === request.initiator)?.name} 想和你商量</strong><small>{request.title}</small></span>{pendingThreads.length > 1 ? <b>{pendingThreads.length}</b> : null}<ChevronRight size={14} /></button> : null}
      <nav className="hud-utilities" aria-label="营地菜单">
        <button className="hud-utility-button" title="林间手记" aria-label="林间手记" aria-haspopup="dialog" onClick={() => openDialog('journal')}><BookOpen size={23} /><span>手记</span></button>
        <button className="hud-utility-button" title="营地选项" aria-label="营地选项" aria-haspopup="dialog" onClick={() => openDialog('camp')}><House size={23} /><span>营地</span></button>
      </nav>
    </div>
    {dialog === 'welcome' || dialog === 'new' ? <JourneyDialog initial={dialog === 'new' ? game : undefined} savedGame={dialog === 'welcome' ? controls.savedGame : null} loading={controls.loadingModel} modelError={controls.modelError} onStart={startGame} initialDraft={journeyDraft.current} onSettings={draft => { journeyDraft.current = draft; openSettings(); }} onGameSettings={draft => { journeyDraft.current = draft; openGameSettings(); }} starting={starting} settingsError={settingsError} worldReady={controls.worldReady} worldError={controls.worldError} onStartDefaults={options => { cancelStart(); void finishStart(options).catch(error => setSettingsError(error instanceof Error ? error.message : '无法开始旅程')); }} onContinue={() => { cancelStart(); void controls.resumeSaved().then(resumed => { if (resumed) setDialog(null); }); }} onRetry={controls.retryModel} onClose={dialog === 'new' ? closeDialog : undefined} /> : null}
    {dialog==='loading'?<div className="world-restore-screen" role="status" aria-live="polite"><strong>{controls.worldError?'正在重新连接存档…':'正在读取保存的进度…'}</strong><p>已有旅程会自动载入。</p></div>:null}
    <WorldChannel onMore={dialog===null?()=>openDialog('conversation-history'):undefined} onReply={target=>{setSocialNpcId(target.npcId);setSocialThreadId(target.threadId??null);if(dialog===null)openDialog('social');else setDialog('social');}} />
    {dialog==='conversation-history'?<ConversationHistoryDialog onClose={closeDialog}/>:null}
      {dialog === 'game-settings' ? <GameSettingsDialog onClose={closeGameSettings} onReset={resetGame} resetDisabled={!controls.worldReady} game={game} onAgencySettings={controls.setAgencySettings}/> : null}
    {dialog === 'settings' ? <NpcSettingsDialog onClose={closeSettings} /> : null}
    {dialog === 'help' ? <HelpDialog onClose={closeDialog} /> : null}
    {dialog === 'weather' ? <WeatherDialog game={game} sound={controls.sound} soundPending={controls.soundPending} onSound={controls.toggleSound} onWeather={weather => { sendCommand({ type: 'weather', weather }); closeDialog(); }} onObserve={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'camp' ? <CampDrawer onSettings={openSettings} onGameSettings={openGameSettings} game={game} dialogue={controls.dialogue} onToggleDialogue={controls.toggleDialogue} onRetryDialogue={controls.retryDialogue} saveStatus={controls.saveStatus} offlineReady={controls.offlineReady} onCommand={sendCommand} onObserve={() => setDialog('decisions')} onTalk={() => { setSocialThreadId(null); setSocialNpcId(game.selectedNpc); sendCommand({ type: 'social-open', npcId: game.selectedNpc, topic: 'checkin' }); setDialog('social'); }} onNew={showNewJourney} onClose={closeDialog} /> : null}
    {dialog === 'social' ? <SocialDialog game={game} thread={socialThread} npcId={socialNpcId} onCommand={sendCommand} onTopic={talk} onClose={closeDialog} /> : null}
    {dialog === 'journal' ? <JournalDrawer game={game} onObserve={() => setDialog('decisions')} onClose={closeDialog} /> : null}
    {dialog === 'decisions' ? <DecisionPanel game={game} model={model} onClose={closeDialog} onExperiment={() => { wasPlaying.current = false; showNewJourney(); }} /> : null}
  </>;
}
