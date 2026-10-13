import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, advanceGame, issueCommand } from '../games/camp/simulation/engine';
import { loadPolicy, inferPolicy, baselinePolicy } from '../games/camp/ai/policy';
import type { LoadedPolicy } from '../games/camp/ai/policy';
import { loadGame, saveGame, clearSave } from '../games/camp/simulation/persistence';
import { gameAudio } from '../games/camp/simulation/audio';
import type { GameCommand, GameOptions, GameState, Point } from '../games/camp/simulation/types';
import { DialogueDirector } from '../games/camp/dialogue';
import type { DialogueStatus } from '../games/camp/dialogue';

export function useGame() {
  const [game, setGame] = useState(() => createGame({ seed: 64138, difficulty: 'cozy' }));
  const gameRef = useRef(game);
  const [savedGame, setSavedGame] = useState(() => loadGame());
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
  const dialogueRef = useRef<DialogueDirector | null>(null);
  const conversationThreadRef = useRef<number | null>(null);
  const [dialogue, setDialogue] = useState<DialogueStatus>({ mode: 'checking', enabled: true,
    generated: 0, cached: 0, discarded: 0, failures: 0, latencyMs: 0, poolSize: 0, lines: {} });

  const update = useCallback((fn: (previous: GameState) => GameState) => {
    const next = fn(gameRef.current);
    gameRef.current = next;
    setGame(next);
  }, []);

  useEffect(() => {
    const director = new DialogueDirector({ read: () => gameRef.current,
      publish: next => update(() => next), onStatus: setDialogue,
      onSpoken: (npcId, text) => {
        if (soundRef.current && gameRef.current.status === 'playing' && !document.hidden
          && gameRef.current.selectedNpc === npcId) gameAudio.speakDialogue(npcId, text);
      } });
    dialogueRef.current = director;
    const timer = window.setInterval(() => {
      if (!document.hidden && director.snapshot().mode === 'fallback') void director.probe();
    }, 10000);
    return () => { clearInterval(timer); director.dispose(); dialogueRef.current = null; };
  }, [update]);

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
    const id = window.setInterval(() => {
      const current = gameRef.current;
      if (current.status !== 'playing' || document.hidden) return;
      if (current.mode === 'model' && !modelRef.current) return;
      update(state => {
        let next = state;
        for (let tick = 0; tick < speed && next.status === 'playing'; tick++) {
          next = advanceGame(next, 0.1, observation => state.mode === 'rules'
            ? baselinePolicy(observation)
            : inferPolicy(modelRef.current!, observation));
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [speed, update]);

  useEffect(() => {
    const persist = () => {
      const current = gameRef.current;
      if (current.status === 'ready') return;
      const saved = saveGame(current);
      setSaveStatus(saved ? '进度已保存' : '此浏览器无法保存进度');
    };
    const visibility = () => {
      if (document.hidden) {
        gameAudio.stop();
        dialogueRef.current?.reset();
        update(state => state.status === 'playing' ? { ...state, status: 'paused' } : state);
        persist();
      } else {
        // reset() cancels hidden-tab work. Restore only the still-open explicit
        // conversation so returning to a paused panel can generate its next line.
        dialogueRef.current?.setConversationThread(conversationThreadRef.current);
        dialogueRef.current?.sync(gameRef.current);
      }
    };
    const timer = window.setInterval(persist, 3000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', persist);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', persist); };
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

  useEffect(() => {
    if (game.status === 'won' && sound) gameAudio.play('success');
    if (game.status === 'won' || game.status === 'lost') saveGame(game);
  }, [game.status, sound]);

  const sendCommand = useCallback((command: GameCommand) => {
    if (sound) { void gameAudio.unlock(); gameAudio.play('click'); }
    update(state => issueCommand(state, command));
  }, [sound, update]);

  const start = useCallback((options: GameOptions) => {
    if (options.mode !== 'rules' && !modelRef.current) return false;
    const next = createGame(options);
    conversationThreadRef.current = null;
    dialogueRef.current?.reset();
    gameAudio.stop();
    lastEventRef.current = next.events.at(-1)?.id ?? 0;
    clearSave();
    setSavedGame(null); setSaveStatus(''); setSpeed(1);
    update(() => ({ ...next, status: 'playing' }));
    if (sound) { void gameAudio.unlock(); gameAudio.play('click'); }
    return true;
  }, [sound, update]);

  const resumeSaved = useCallback(() => {
    if (!savedGame || (savedGame.mode === 'model' && !modelRef.current)) return false;
    conversationThreadRef.current = null;
    dialogueRef.current?.reset();
    gameAudio.stop();
    lastEventRef.current = savedGame.events.at(-1)?.id ?? 0;
    update(() => ({ ...savedGame, status: ['won', 'lost'].includes(savedGame.status) ? savedGame.status : 'playing' }));
    if (sound) void gameAudio.unlock();
    return true;
  }, [savedGame, sound, update]);

  const pause = useCallback(() => {
    gameAudio.stop();
    update(state => state.status === 'playing' ? { ...state, status: 'paused' } : state);
  }, [update]);
  const togglePause = useCallback(() => {
    if (gameRef.current.status === 'playing') gameAudio.stop();
    else if (sound) void gameAudio.unlock();
    update(state => state.status === 'playing' ? { ...state, status: 'paused' } : state.status === 'paused' ? { ...state, status: 'playing' } : state);
  }, [sound, update]);
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

  return { game, savedGame, model, modelError, loadingModel, speed, sound, soundPending, soundError, saveStatus, offlineReady,
    dialogue, toggleDialogue: () => dialogueRef.current?.setEnabled(!dialogue.enabled),
    retryDialogue: prepareDialogue, prepareDialogue,
    sendCommand, start, resumeSaved, pause, togglePause, setSpeed, toggleSound,
    setListenerRight, setConversationThread,
    retryModel: () => setModelAttempt(n => n + 1) };
}
