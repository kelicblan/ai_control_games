import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Apple, Axe, Camera, Compass, Flame, Moon, RotateCcw, House, Trees, ZoomIn, ZoomOut } from 'lucide-react';
import type { ActionId, GameCommand, GameState, NpcId, Point, ReactionKind } from '../games/camp/simulation/types';
import { createCampScene } from '../scene/campScene';
import type { CampScene, SceneProjection, ViewMode } from '../scene/campScene';
import { ACTION_LABELS, ActionIcon, cssVars } from './ui';
import '../styles/scene.css';
import type { DialogueStatus } from '../games/camp/dialogue';
import { worldMessages } from '../gameMessages';
import { DialogueSourceIcon } from './DialogueSourceIcon';

const availableMarkers = [
  { id: 'wood', action: 'wood' as ActionId, name: '松林', icon: Axe },
  { id: 'food', action: 'food' as ActionId, name: '浆果丛', icon: Apple },
  { id: 'fire', action: 'fire' as ActionId, name: '篝火', icon: Flame },
  { id: 'rest', action: 'rest' as ActionId, name: '民居', icon: House },
  { id: 'explore', action: 'explore' as ActionId, name: '林间', icon: Compass },
];
const reactionLabels: Record<ReactionKind, string> = { burn: '烫伤', thorns: '刺伤', impact: '撞疼了', water: '好冷！', bump: '借过' };
export interface CampMapProps {
  game: GameState; onSelect: (id: NpcId) => void; onAssign: (action: ActionId) => void;
  onResume: () => void; onMove?: (target: Point) => void; onPause?: () => void;
  onViewDirection?: (right: Point) => void;
  dialogueLines?: DialogueStatus['lines'];
  onReady?: () => void;
  onCommand?: (command:GameCommand)=>void;
  onLordInput?: (direction: Point) => void;
  resetVersion?: number;
  npcCommandsEnabled?: boolean;
  dispatchActive?: boolean;
  onViewModeChange?: (mode:ViewMode)=>void;
}

export function CampMap({ game, onSelect, onAssign, onResume, onMove, onPause, onViewDirection, onReady, onLordInput, onCommand, resetVersion = 0, npcCommandsEnabled = true, dispatchActive = false, onViewModeChange }: CampMapProps) {
  useSyncExternalStore(worldMessages.subscribe, worldMessages.getSnapshot);
  const hostRef = useRef<HTMLDivElement>(null), sceneRef = useRef<CampScene | null>(null);
  const latest = useRef({ game, onSelect, onAssign, onMove, onViewDirection, onLordInput, resetVersion,onViewModeChange }); latest.current = { game, onSelect, onAssign, onMove, onViewDirection, onLordInput, resetVersion,onViewModeChange };
  const lordElement=useRef<HTMLDivElement>(null);
  const [viewMode,setViewMode]=useState<ViewMode>('god');
  const viewModeRef=useRef<ViewMode>('god');
  const npcElements = useRef(new Map<NpcId, HTMLButtonElement>()), markerElements = useRef(new Map<string, HTMLButtonElement>());
  const [attempt, setAttempt] = useState(0), [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'), [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => { viewModeRef.current = 'god'; setViewMode('god'); setCameraOpen(false); }, [resetVersion]);
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let cancelled = false; setStatus('loading'); setError('');
    const project = (projection: SceneProjection) => {
      const lord=lordElement.current;
      if(lord){lord.style.visibility=projection.lord?.visible?'visible':'hidden';if(projection.lord){lord.style.left=`${projection.lord.x}px`;lord.style.top=`${projection.lord.y}px`;}}
      for (const item of projection.npcs) {
        const element = npcElements.current.get(item.id); if (!element) continue;
        element.style.left = `${item.feet.x.toFixed(2)}px`; element.style.top = `${(item.feet.y + 11).toFixed(2)}px`;
        element.style.height = `${Math.max(36, item.feet.y - item.head.y + 20).toFixed(2)}px`;
        element.style.visibility = item.feet.visible ? 'visible' : 'hidden'; element.style.zIndex = String(Math.round(160 - item.feet.depth * 100));
      }
      for (const item of projection.markers) {
        const element = markerElements.current.get(item.id); if (!element) continue;
        element.style.left = `${item.point.x.toFixed(2)}px`; element.style.top = `${item.point.y.toFixed(2)}px`; element.style.visibility = item.point.visible ? 'visible' : 'hidden';
      }
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        sceneRef.current = createCampScene(host, latest.current.game, {
          onSelect: id => latest.current.onSelect(id), onAssign: action => latest.current.onAssign(action), onMove: point => latest.current.onMove?.(point), onProject: project,
          onStatus: (next, message) => { if (!cancelled) { setStatus(next); setError(message ?? ''); } },
          onViewDirection: right => latest.current.onViewDirection?.(right),
          onLordInput: direction=>latest.current.onLordInput?.(direction),
          onViewMode: mode=>{viewModeRef.current=mode;setViewMode(mode);latest.current.onViewModeChange?.(mode);},
        });
        sceneRef.current.setViewMode(viewModeRef.current);
      } catch (cause) { if (!cancelled) { setStatus('error'); setError(cause instanceof Error ? cause.message : '立体营地暂时无法绘制，请重试。'); } }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); sceneRef.current?.dispose(latest.current.resetVersion === resetVersion); sceneRef.current = null; };
  }, [attempt,game.seed,resetVersion]);
  useEffect(() => { sceneRef.current?.update(game); }, [game]);
  useEffect(() => { if (status === 'ready') onReady?.(); }, [status, onReady]);
  useEffect(() => { if (status === 'error' && game.status === 'playing') onPause?.(); }, [status, game.status, onPause]);
  useEffect(()=>{worldMessages.condition('scene',status==='error'?error:'');},[status,error]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Tab'||event.repeat||event.ctrlKey||event.altKey||event.metaKey||!sceneRef.current||hostRef.current?.closest('[inert]'))return;
      if(event.target instanceof Element&&event.target.closest('button,a,input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
      event.preventDefault();sceneRef.current.setViewMode(viewModeRef.current==='god'?'lord':'god');
    };
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[]);
  const interactive = game.status === 'playing' || game.status === 'paused';
  const markers=npcCommandsEnabled?availableMarkers:availableMarkers.filter(marker=>marker.action==='fire');
  return <div className={`camp-map scene-map ${game.weather} ${game.status === 'paused' ? 'map-paused' : ''}`} aria-label="可交互营地地图" data-scene-state={status} data-dispatch-active={dispatchActive}>
    <div className="scene-host" ref={hostRef} /><div className="scene-vignette" aria-hidden="true" />
    <p className="scene-a11y">点伙伴选择人物，点地点图标分配任务，点地面前往。拖动旋转视角，双指或滚轮缩放。荆棘和溪水会造成伤害；篝火只作环境展示。</p>
    {status === 'ready' ? <div className="scene-labels">
      <div ref={lordElement} className="scene-lord-label">♛ 领主<span>你</span></div>
      {markers.map(marker => <button key={marker.id} ref={element => { if (element) markerElements.current.set(marker.id, element); else markerElements.current.delete(marker.id); }} className={`scene-location location-${marker.action}`} data-scene-action={marker.action} onClick={() => { if (marker.action !== 'fire') onAssign(marker.action); }} disabled={!interactive || marker.action === 'fire'} aria-label={marker.action === 'fire' ? `篝火${game.fire > 0 ? '燃烧' : '熄灭'}，不影响生存` : `让选中伙伴${ACTION_LABELS[marker.action]}`} title={marker.action === 'fire' ? '随木材库存亮灭，无需添柴，不影响生存' : `${marker.name} · ${ACTION_LABELS[marker.action]}`}>
        <marker.icon size={18} /><span>{marker.name}</span>{marker.action === 'fire' ? <small>{game.fire > 0 ? '燃烧' : '熄灭'}</small> : null}
      </button>)}
      {game.npcs.map(npc => {
        const bubble = worldMessages.bubble(npc.id);
        const hit = npc.collision?.lastHit, hitAge = hit ? game.elapsed - hit.time : Infinity, reacting = hit && hitAge >= 0 && hitAge < 1.65;
        return <button key={npc.id} ref={element => { if (element) npcElements.current.set(npc.id, element); else npcElements.current.delete(npc.id); }} className={`map-npc scene-npc ${game.selectedNpc === npc.id ? 'selected' : ''} ${!npc.alive ? 'fallen' : ''} ${reacting ? 'reacting' : ''}`} data-scene-npc={npc.id} onClick={() => onSelect(npc.id)} aria-label={`地图上选择${npc.name}`} aria-pressed={game.selectedNpc === npc.id} style={cssVars({ '--npc-color': npc.color })}>
          {bubble && bubble.until > game.elapsed && game.status !== 'ready' && game.selectedNpc === npc.id ? <span data-speech-source={bubble.source} className="npc-speech scene-speech"><DialogueSourceIcon source={bubble.source} />{bubble.text}</span> : null}
          {reacting ? <span key={`${hit.time}-${hit.objectId}`} className={`scene-damage damage-${hit.kind}`}>{reactionLabels[hit.kind]}{hit.damage > 0 ? <b>−{Math.round(hit.damage)}</b> : null}</span> : null}
          <span className="npc-nameplate">{npc.injured ? <span className="injury-indicator">!</span> : npc.action === 'rest' ? <Moon size={10} /> : <ActionIcon action={npc.action ?? 'camp'} size={10} />}{npc.name}<span className="npc-work-bar"><i style={{ width: `${npc.progress * 100}%` }} /></span></span>
        </button>;
      })}
    </div> : <div className={`scene-fallback ${status === 'error' ? 'scene-error' : ''}`} role="status" aria-live="polite">
      <Trees size={39} /><strong>{status === 'error' ? '村寨画面需要重新加载' : '正在走进村寨…'}</strong>{status !== 'error' ? <p>民居、仓库与寨门正在准备。</p> : null}
      {status === 'error' ? <button onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} />重新绘制营地</button> : <span className="scene-loading-glow" />}
    </div>}
    {status === 'ready' ? <><div className="scene-view-switch" role="group" aria-label="世界视角">
      <button aria-pressed={viewMode==='lord'} onClick={()=>{sceneRef.current?.setViewMode('lord');(document.activeElement as HTMLElement)?.blur();}}>♛ 领主视角</button>
      <button aria-pressed={viewMode==='god'} onClick={()=>{sceneRef.current?.setViewMode('god');(document.activeElement as HTMLElement)?.blur();}}>上帝视角</button><kbd>Tab</kbd>
      <button disabled={!interactive} onClick={()=>onCommand?.({type:'gate-toggle'})}>{game.world?.gateOpen===false?'打开寨门':'关闭寨门'}</button>
      <span>{viewMode==='lord'?'WASD 移动 · 拖动转向 · 滚轮调距':'拖动浏览 · 右键旋转 · 滚轮缩放'}</span>
    </div><div className={`scene-camera-controls ${cameraOpen ? 'camera-open' : ''}`} aria-label="营地视角">
      <button onClick={() => setCameraOpen(value => !value)} title="调整营地视角" aria-label="调整营地视角" aria-expanded={cameraOpen}><Camera size={19} /></button>
      {cameraOpen ? <><button onClick={() => sceneRef.current?.resetCamera()} title="复位视角" aria-label="复位营地视角"><RotateCcw size={18} /></button>
      <button onClick={() => sceneRef.current?.zoom(1.2)} title="放大营地" aria-label="放大营地"><ZoomIn size={19} /></button>
      <button onClick={() => sceneRef.current?.zoom(1 / 1.2)} title="缩小营地" aria-label="缩小营地"><ZoomOut size={19} /></button></> : null}
    </div><div className="scene-gesture-hint" aria-hidden="true">轻触安排 · 拖动视角</div>
      {game.status === 'paused' ? <button className="paused-chip" onClick={onResume}><span className="pause-glyph">Ⅱ</span>旅程已暂停 <small>点击继续</small></button> : null}
    </> : null}
  </div>;
}
