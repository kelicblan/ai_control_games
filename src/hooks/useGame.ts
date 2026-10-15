import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, issueCommand } from '../games/camp/simulation/engine';
import { loadPolicy } from '../games/camp/ai/policy';
import type { LoadedPolicy } from '../games/camp/ai/policy';
import { WorldClient } from '../integrations/world/client';
import { publication } from '../integrations/world/publication';
import type { WorldAction, WorldSnapshot } from '../integrations/world/types';
import { clearRuntimeStorage } from '../integrations/world/resetStorage';
import { gameAudio } from '../games/camp/simulation/audio';
import type { GameCommand, GameOptions, GameState, Point } from '../games/camp/simulation/types';
import { DialogueSession } from '../games/camp/dialogue/session';
import type { DialogueStatus } from '../games/camp/dialogue';
import { worldMessages } from '../gameMessages';
import { modelManager } from '../integrations/models/runtime';
import { cognitionModelId, ownsCognitionBinding } from '../integrations/models/cognition';

export function useGame() {
  const [game, setGame] = useState(() => createGame({ seed: 64138, difficulty: 'cozy' }));
  const gameRef = useRef(game);
  const [savedGame, setSavedGame] = useState<GameState | null>(null);
  const clientRef = useRef<WorldClient | null>(null);
  const attachedRef = useRef(false);
  const [worldReady, setWorldReady] = useState(false);
  const [worldError, setWorldError] = useState('');
  const [worldGeneration, setWorldGeneration] = useState(0);
  const [cognitionModel,setCognitionModel]=useState(()=>cognitionModelId(modelManager.snapshot().activeId,modelManager.catalog()));
  const bindingPending=useRef(false);
  const [bindingOwner,setBindingOwner]=useState(()=>ownsCognitionBinding(!document.hidden,document.hasFocus()));
  const [model, setModel] = useState<LoadedPolicy | null>(null);
  const modelRef = useRef<LoadedPolicy | null>(null);
  const [modelError, setModelError] = useState('');
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [sound, setSound] = useState(false);
  const [soundPending, setSoundPending] = useState(false);
  const [soundError, setSoundError] = useState('');
  const soundRef = useRef(false), soundRequest = useRef(0);
  const speedRef = useRef(speed); speedRef.current = speed;
  const listenerRight = useRef<Point | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const lastEventRef = useRef(0);
  const dialogueRef = useRef<DialogueSession | null>(null);
  const dialogueSnapshot = useRef<Pick<WorldSnapshot, 'dialogueScope' | 'dialogues' | 'serverDialogue' | 'moderationVersion'>>({});
  const conversationThreadRef = useRef<number | null>(null);
  const [dialogue, setDialogue] = useState<DialogueStatus>({ mode: 'checking', enabled: true,
    generated: 0, cached: 0, discarded: 0, failures: 0, latencyMs: 0, poolSize: 0, lines: {} });

  const update = useCallback((fn: (previous: GameState) => GameState) => {
    const next = fn(gameRef.current);
    worldMessages.capture(next);
    gameRef.current = next;
    setGame(next);
  }, []);

  const mutate = useCallback((action: WorldAction) => {
    if (!clientRef.current) return Promise.reject(new Error('存档服务尚未连接'));
    return clientRef.current.mutate(action);
  }, []);
  useEffect(()=>modelManager.subscribe(state=>setCognitionModel(cognitionModelId(state.activeId,modelManager.catalog()))),[]);
  useEffect(()=>{
    const sync=()=>setBindingOwner(ownsCognitionBinding(!document.hidden,document.hasFocus()));
    window.addEventListener('focus',sync);window.addEventListener('blur',sync);document.addEventListener('visibilitychange',sync);sync();
    return()=>{window.removeEventListener('focus',sync);window.removeEventListener('blur',sync);document.removeEventListener('visibilitychange',sync);};
  },[]);
  useEffect(()=>{
    if(!bindingOwner||!savedGame||bindingPending.current||game.agency?.modelId===cognitionModel&&game.agency?.cognition&&game.agency?.modelBinding==='dialogue')return;
    bindingPending.current=true;
    void mutate({type:'agency-model',modelId:cognitionModel}).catch(()=>{}).finally(()=>{bindingPending.current=false;});
  },[bindingOwner,worldReady,savedGame,cognitionModel,game.agency?.modelId,game.agency?.cognition,game.agency?.modelBinding,mutate]);

  useEffect(() => {
    const client = new WorldClient((snapshot: WorldSnapshot) => {
      publication.update(snapshot.dialogueScope,snapshot.moderationVersion);
      if (dialogueSnapshot.current.dialogueScope && dialogueSnapshot.current.dialogueScope !== snapshot.dialogueScope) worldMessages.reset();
      if(dialogueSnapshot.current.moderationVersion&&dialogueSnapshot.current.moderationVersion!==snapshot.moderationVersion)worldMessages.reset();
      dialogueSnapshot.current = snapshot;
      if (snapshot.state) worldMessages.captureDialogues(snapshot.dialogues ?? [], snapshot.state);
      setWorldReady(!snapshot.catchingUp); setSavedGame(snapshot.state); setSpeed(snapshot.speed);
      // Reconnect directly to the authoritative snapshot, without requiring
      // another user choice or the optional local policy model to finish loading.
      if(snapshot.state&&!attachedRef.current)attachedRef.current=true;
      setSaveStatus(snapshot.catchingUp ? '正在补算离线期间的世界…' : snapshot.state ? `${snapshot.recovered ? '已从历史快照恢复 · ' : ''}数据库已保存 ${new Date(snapshot.savedAt).toLocaleTimeString()}` : '数据库已连接');
      if (attachedRef.current && snapshot.state) update(() => snapshot.state!);
    }, message => { setWorldError(message); if (message) { setSaveStatus(`保存异常：${message}`); setWorldReady(false); } });
    clientRef.current = client;
    const timer = window.setInterval(() => { void client.poll(); }, 250);
    return () => { clearInterval(timer); client.dispose(); clientRef.current = null; };
  }, [update]);

  useEffect(() => {
    const director = new DialogueSession({ read: () => gameRef.current,
      serverManaged:()=>dialogueSnapshot.current.serverDialogue===true,
      scope: () => dialogueSnapshot.current.dialogueScope,
      records: () => dialogueSnapshot.current.dialogues ?? [],
      persist: async (scope, result) => {
        const snapshot = await mutate({ type: 'dialogue-result', scope, result });
        const saved = snapshot.dialogues?.find(item => item.id === result.id);
        if (!saved) throw new Error('数据库未确认这条对话');
        return saved;
      },
      onPending: (input, error) => worldMessages.waiting(input.id,
        gameRef.current.npcs.find(npc => npc.id === input.npcId)?.name ?? input.npcId, input.at, error),
      onStatus: setDialogue,
      onSpoken: (npcId, text) => {
        if (soundRef.current && gameRef.current.status === 'playing' && !document.hidden
          && gameRef.current.selectedNpc === npcId) gameAudio.speakDialogue(npcId, text);
      } });
    dialogueRef.current = director;
    const timer = window.setInterval(() => {
      if (!document.hidden && director.snapshot().mode === 'fallback' && !director.snapshot().modelRetryStopped) void director.probe(true);
    }, 10000);
    return () => { clearInterval(timer); director.dispose(); dialogueRef.current = null; };
  }, [mutate, update]);

  useEffect(() => { if (!document.hidden) dialogueRef.current?.sync(game); }, [game]);
  const prepareDialogue = useCallback(() => { void dialogueRef.current?.probe(); }, []);

  const setConversationThread = useCallback((threadId: number | null) => {
    conversationThreadRef.current = threadId;
    dialogueRef.current?.setConversationThread(threadId);
    if (!document.hidden) dialogueRef.current?.sync(gameRef.current);
  }, []);

  const syncAudio = useCallback((state: GameState) => {
    const listener = state.npcs.find(npc => npc.id === state.selectedNpc && npc.alive)
      ?? state.npcs.find(npc => npc.alive);
    gameAudio.syncWeather(state.atmosphere, state.elapsed, state.status === 'playing' && !document.hidden, {
      fire: state.fire, listener: listener?.position ?? { x: 51, y: 60.2 }, seed: state.seed,
      timeScale: speedRef.current, listenerRight: listenerRight.current,
    });
  }, []);

  const setListenerRight = useCallback((right: Point) => {
    listenerRight.current = right;
    syncAudio(gameRef.current);
  }, [syncAudio]);

  useEffect(() => {
    let cancelled = false;
    setLoadingModel(true); setModelError('');
    loadPolicy().then(loaded => {
      if (!cancelled) { modelRef.current = loaded; setModel(loaded); setLoadingModel(false); }
    }).catch((error: unknown) => {
      if (!cancelled) { setModelError(error instanceof Error ? error.message : '本地模型加载失败'); setLoadingModel(false); }
    });
    return () => { cancelled = true; };
  }, [modelAttempt]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        gameAudio.stop();
      } else {
        // Visibility affects presentation, not the lifetime of a dialogue request.
        dialogueRef.current?.setConversationThread(conversationThreadRef.current);
        dialogueRef.current?.sync(gameRef.current);
        void clientRef.current?.poll();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); };
  }, [update]);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    const checkCache = async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active || cancelled) return;
      const channel = new MessageChannel();
      const timeout = setTimeout(() => channel.port1.close(), 4000);
      channel.port1.onmessage = event => {
        if (!cancelled) setOfflineReady(event.data?.type === 'CACHE_STATUS' && event.data?.complete === true);
        clearTimeout(timeout); channel.port1.close();
      };
      registration.active.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
    };
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(checkCache).catch(() => { if (!cancelled) setOfflineReady(false); });
    const onController = () => { void checkCache(); };
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener('controllerchange', onController); };
  }, []);

  useEffect(() => {
    const fresh = game.events.filter(event => event.id > lastEventRef.current);
    if (!fresh.length) return;
    // Consume even while silent/paused so turning sound on never replays a backlog.
    lastEventRef.current = fresh.at(-1)!.id;
    if (!sound || game.status !== 'playing' || document.hidden) return;
    const reactions = fresh.filter(event => event.reaction && event.npcId);
    if (reactions.length) {
      for (const event of reactions) gameAudio.playReaction(event.npcId!, event.reaction!);
    } else {
      const newest = fresh.at(-1)!;
      gameAudio.play(newest.kind === 'danger' || newest.kind === 'warning' ? 'warning' : newest.kind === 'good' ? 'harvest' : 'click');
    }
  }, [game.events, game.status, sound]);

  useEffect(() => {
    gameAudio.setEnabled(sound);
  }, [sound]);

  useEffect(() => {
    if (game.status !== 'playing') gameAudio.stop();
  }, [game.status]);

  useEffect(() => {
    syncAudio(game);
  }, [game, sound, speed, syncAudio]);

  useEffect(() => () => { soundRequest.current++; void gameAudio.dispose(); }, []);

  const sendCommand = useCallback((command: GameCommand) => {
    if(command.type==='social-refresh'){
      void mutate({type:'social-refresh',setId:command.setId!,scope:dialogueSnapshot.current.dialogueScope??''}).catch(()=>{});return;
    }
    if(command.type==='social-choice'){
      void mutate({type:'social-choice',setId:command.setId!,choiceId:command.choiceId!,scope:dialogueSnapshot.current.dialogueScope??''}).catch(()=>{});return;
    }
    worldMessages.command(command,gameRef.current);
    if (sound) { void gameAudio.unlock(); gameAudio.play('click'); }
    if(!['social-open','social-reply','social-chat','collective-reply'].includes(command.type))update(state => issueCommand(state, command));
    void mutate({ type: 'command', command }).catch(() => {});
  }, [sound, update, mutate]);
  const sendLordInput = useCallback((direction: Point) => {
    if(attachedRef.current)clientRef.current?.sendLordInput(direction);
  }, []);

  const start = useCallback(async (options: GameOptions) => {
    if (options.mode !== 'rules' && !modelRef.current) return false;
    const snapshot = await mutate({ type: 'start', options });
    const next = snapshot.state!;
    worldMessages.reset();
    attachedRef.current = true;
    conversationThreadRef.current = null;
    dialogueRef.current?.reset();
    gameAudio.stop();
    lastEventRef.current = next.events.at(-1)?.id ?? 0;
    setSavedGame(null); setSaveStatus(''); setSpeed(1);
    update(() => ({ ...next, status: 'playing' }));
    if (sound) { void gameAudio.unlock(); gameAudio.play('click'); }
    return true;
  }, [sound, update, mutate]);

  const resumeSaved = useCallback(async () => {
    if (!savedGame || (savedGame.mode === 'model' && !modelRef.current)) return false;
    await clientRef.current?.poll();
    const latest = clientRef.current?.snapshot.state;
    if (!latest) return false;
    attachedRef.current = true;
    conversationThreadRef.current = null;
    dialogueRef.current?.reset();
    gameAudio.stop();
    lastEventRef.current = savedGame.events.at(-1)?.id ?? 0;
    update(() => latest);
    if (sound) void gameAudio.unlock();
    return true;
  }, [savedGame, sound, update]);

  const reset = useCallback(async (npcSettings: GameOptions['npcSettings']) => {
    const director = dialogueRef.current;
    const enabled = director?.snapshot().enabled ?? true;
    director?.setEnabled(false);
    gameAudio.stop();
    try {
      const snapshot = await mutate({ type: 'reset', npcSettings });
      conversationThreadRef.current = null;
      director?.reset(true);
      lastEventRef.current = snapshot.state!.events.at(-1)?.id ?? 0;
      attachedRef.current = true;
      worldMessages.reset();
      update(() => snapshot.state!);
      setSavedGame(snapshot.state); setSpeed(1);
      try { clearRuntimeStorage(); }
      catch { throw new Error('世界已重置，但浏览器旧存档或视角记录未能清理，请允许本地存储后重试。'); }
      finally { setWorldGeneration(value => value + 1); }
    } finally { director?.setEnabled(enabled); }
  }, [mutate, update]);

  const pause = useCallback(() => {
    gameAudio.stop();
    update(state => state.status === 'playing' ? { ...state, status: 'paused' } : state);
    void mutate({ type: 'pause', paused: true, temporary: true }).catch(() => {});
  }, [update, mutate]);
  const resume = useCallback(() => {
    void mutate({ type: 'pause', paused: false, temporary: true }).catch(() => {});
  }, [mutate]);
  const togglePause = useCallback(() => {
    if (gameRef.current.status === 'playing') gameAudio.stop();
    else if (sound) void gameAudio.unlock();
    const paused = gameRef.current.status === 'playing';
    update(state => state.status === 'playing' ? { ...state, status: 'paused' } : state.status === 'paused' ? { ...state, status: 'playing' } : state);
    void mutate({ type: 'pause', paused }).catch(() => {});
  }, [sound, update, mutate]);

  const changeSpeed = useCallback((value: number) => {
    void mutate({ type: 'speed', speed: value }).catch(() => {});
  }, [mutate]);
  const toggleSound = useCallback(async () => {
    const request = ++soundRequest.current;
    const next = !soundRef.current;
    soundRef.current = next;
    setSoundError('');
    gameAudio.setEnabled(next);
    if (!next) { setSound(false); setSoundPending(false); return; }
    setSoundPending(true);
    // A user gesture unlocks the actual device; a failed resume must never make
    // the controls claim that audio is on. Side effects stay outside setState.
    const ready = await gameAudio.unlock();
    if (request !== soundRequest.current) return;
    setSoundPending(false);
    soundRef.current = ready;
    setSound(ready);
    if (!ready) {
      gameAudio.setEnabled(false);
      setSoundError('暂未能播放声音，请再点一次开启。');
      return;
    }
    if (!document.hidden) gameAudio.play('click');
    syncAudio(gameRef.current);
  }, [syncAudio]);

  return { game, savedGame, model, modelError, loadingModel, worldReady, worldError, worldGeneration, speed, sound, soundPending, soundError, saveStatus, offlineReady,
    dialogue, toggleDialogue: () => dialogueRef.current?.setEnabled(!dialogue.enabled),
    retryDialogue: prepareDialogue, prepareDialogue,
    sendCommand, sendLordInput, start, reset, resumeSaved, pause, resume, togglePause, setSpeed: changeSpeed, toggleSound,
    setListenerRight, setConversationThread,
    setAgencySettings: (action:Extract<WorldAction,{type:'agency-settings'}>) => mutate(action),
    retryModel: () => setModelAttempt(n => n + 1) };
}
