import { useEffect, useRef, useState } from 'react';
import { Apple, Axe, Camera, Compass, Flame, Moon, RotateCcw, TentTree, Trees, ZoomIn, ZoomOut } from 'lucide-react';
import type { ActionId, GameState, NpcId, Point, ReactionKind } from '../game/types';
import { createCampScene } from '../scene/campScene';
import type { CampScene, SceneProjection } from '../scene/campScene';
import { ACTION_LABELS, ActionIcon, cssVars } from './ui';
import '../styles/scene.css';
import type { DialogueStatus } from '../ai/dialogue';

const markers = [
  { id: 'wood', action: 'wood' as ActionId, name: '松林', icon: Axe },
  { id: 'food', action: 'food' as ActionId, name: '浆果丛', icon: Apple },
  { id: 'fire', action: 'fire' as ActionId, name: '篝火', icon: Flame },
  { id: 'rest', action: 'rest' as ActionId, name: '休息区', icon: TentTree },
  { id: 'explore', action: 'explore' as ActionId, name: '林间', icon: Compass },
];
const reactionLabels: Record<ReactionKind, string> = { burn: '烫伤', thorns: '刺伤', impact: '撞疼了', water: '好冷！', bump: '借过' };
export interface CampMapProps {
  game: GameState; onSelect: (id: NpcId) => void; onAssign: (action: ActionId) => void;
  onResume: () => void; onMove?: (target: Point) => void; onPause?: () => void;
  onViewDirection?: (right: Point) => void;
  dialogueLines?: DialogueStatus['lines'];
}

export function CampMap({ game, onSelect, onAssign, onResume, onMove, onPause, onViewDirection, dialogueLines }: CampMapProps) {
  const hostRef = useRef<HTMLDivElement>(null), sceneRef = useRef<CampScene | null>(null);
  const latest = useRef({ game, onSelect, onAssign, onMove, onViewDirection }); latest.current = { game, onSelect, onAssign, onMove, onViewDirection };
  const npcElements = useRef(new Map<NpcId, HTMLButtonElement>()), markerElements = useRef(new Map<string, HTMLButtonElement>());
  const [attempt, setAttempt] = useState(0), [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'), [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let cancelled = false; setStatus('loading'); setError('');
    const project = (projection: SceneProjection) => {
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
        });
      } catch (cause) { if (!cancelled) { setStatus('error'); setError(cause instanceof Error ? cause.message : '立体营地暂时无法绘制，请重试。'); } }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [attempt]);
  useEffect(() => { sceneRef.current?.update(game); }, [game]);
  useEffect(() => { if (status === 'error' && game.status === 'playing') onPause?.(); }, [status, game.status, onPause]);
  const interactive = game.status === 'playing' || game.status === 'paused';
  return <div className={`camp-map scene-map ${game.weather} ${game.status === 'paused' ? 'map-paused' : ''}`} aria-label="可交互营地地图" data-scene-state={status}>
    <div className="scene-host" ref={hostRef} /><div className="scene-vignette" aria-hidden="true" />
    <p className="scene-a11y">点伙伴选择人物，点地点图标分配任务，点地面前往。拖动旋转视角，双指或滚轮缩放。直接靠近篝火、荆棘和溪水会受伤。</p>
    {status === 'ready' ? <div className="scene-labels">
      {markers.map(marker => <button key={marker.id} ref={element => { if (element) markerElements.current.set(marker.id, element); else markerElements.current.delete(marker.id); }} className={`scene-location location-${marker.action}`} data-scene-action={marker.action} onClick={() => onAssign(marker.action)} disabled={!interactive} aria-label={`让选中伙伴${ACTION_LABELS[marker.action]}`} title={`${marker.name} · ${ACTION_LABELS[marker.action]}`}>
        <marker.icon size={18} /><span>{marker.name}</span>{marker.action === 'fire' ? <i className="scene-fire-meter"><b style={{ width: `${game.fire}%` }} /></i> : null}
      </button>)}
      {game.npcs.map(npc => {
        const hit = npc.collision?.lastHit, hitAge = hit ? game.elapsed - hit.time : Infinity, reacting = hit && hitAge >= 0 && hitAge < 1.65;
        return <button key={npc.id} ref={element => { if (element) npcElements.current.set(npc.id, element); else npcElements.current.delete(npc.id); }} className={`map-npc scene-npc ${game.selectedNpc === npc.id ? 'selected' : ''} ${!npc.alive ? 'fallen' : ''} ${reacting ? 'reacting' : ''}`} data-scene-npc={npc.id} onClick={() => onSelect(npc.id)} aria-label={`地图上选择${npc.name}`} aria-pressed={game.selectedNpc === npc.id} style={cssVars({ '--npc-color': npc.color })}>
          {npc.speech && npc.speechUntil > game.elapsed && game.status !== 'ready' && (game.selectedNpc === npc.id || reacting) ? <span data-speech-source={dialogueLines?.[npc.id]?.text === npc.speech ? dialogueLines[npc.id]!.source : 'template'} className={`npc-speech scene-speech ${reacting ? 'hurt-speech' : ''}`}>{npc.speech}</span> : null}
          {reacting ? <span key={`${hit.time}-${hit.objectId}`} className={`scene-damage damage-${hit.kind}`}>{reactionLabels[hit.kind]}{hit.damage > 0 ? <b>−{Math.round(hit.damage)}</b> : null}</span> : null}
          <span className="npc-nameplate">{npc.injured ? <span className="injury-indicator">!</span> : npc.action === 'rest' ? <Moon size={10} /> : <ActionIcon action={npc.action ?? 'camp'} size={10} />}{npc.name}<span className="npc-work-bar"><i style={{ width: `${npc.progress * 100}%` }} /></span></span>
        </button>;
      })}
    </div> : <div className={`scene-fallback ${status === 'error' ? 'scene-error' : ''}`} role="status" aria-live="polite">
      <Trees size={39} /><strong>{status === 'error' ? '营地画面需要重新点亮' : '正在走进松林…'}</strong><p>{status === 'error' ? error : '搭好帐篷，点亮我们的篝火。'}</p>
      {status === 'error' ? <button onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} />重新绘制营地</button> : <span className="scene-loading-glow" />}
    </div>}
    {status === 'ready' ? <><div className={`scene-camera-controls ${cameraOpen ? 'camera-open' : ''}`} aria-label="营地视角">
      <button onClick={() => setCameraOpen(value => !value)} title="调整营地视角" aria-label="调整营地视角" aria-expanded={cameraOpen}><Camera size={19} /></button>
      {cameraOpen ? <><button onClick={() => sceneRef.current?.resetCamera()} title="复位视角" aria-label="复位营地视角"><RotateCcw size={18} /></button>
      <button onClick={() => sceneRef.current?.zoom(1.2)} title="放大营地" aria-label="放大营地"><ZoomIn size={19} /></button>
      <button onClick={() => sceneRef.current?.zoom(1 / 1.2)} title="缩小营地" aria-label="缩小营地"><ZoomOut size={19} /></button></> : null}
    </div><div className="scene-gesture-hint" aria-hidden="true">轻触安排 · 拖动视角</div>
      {game.status === 'paused' ? <button className="paused-chip" onClick={onResume}><span className="pause-glyph">Ⅱ</span>旅程已暂停 <small>点击继续</small></button> : null}
    </> : null}
  </div>;
}
