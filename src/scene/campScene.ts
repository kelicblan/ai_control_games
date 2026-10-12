import {
  ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight,
  Fog, HemisphereLight, MathUtils, Mesh,
  OrthographicCamera, PCFShadowMap, Raycaster, Scene, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import type { ActionId, GameState, NpcId, Point } from '../game/types';
import { configureCamera, defaultOrbit, groundFromScreen, projectWorld } from './camera';
import type { ScreenPoint } from './camera';
import { createCompanion, updateCompanion } from './characters';
import type { CompanionRig } from './characters';
import { createEnvironment } from './environment';
import type { CampEnvironment } from './environment';
import { Shapes } from './geometry';
import { createWeatherEffects } from './weather';
import type { WeatherEffects } from './weather';

export interface SceneProjection {
  npcs: { id: NpcId; feet: ScreenPoint; head: ScreenPoint }[];
  markers: { id: string; point: ScreenPoint }[];
}
export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; fps: number }
export interface SceneCallbacks {
  onSelect: (id: NpcId) => void; onAssign: (action: ActionId) => void; onMove?: (point: Point) => void;
  onProject: (projection: SceneProjection) => void; onStatus: (status: 'ready' | 'error', message?: string) => void;
  onViewDirection?: (right: Point) => void;
}
export interface CampScene {
  update: (state: GameState) => void; resetCamera: () => void; zoom: (amount: number) => void;
  stats: () => SceneStats; dispose: () => void;
}

/** Rendering reads state. Movement, injuries and policy remain authoritative in the game engine. */
export function createCampScene(host: HTMLElement, initial: GameState, callbacks: SceneCallbacks): CampScene {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch { throw new Error('无法开启立体营地。请确认浏览器支持 WebGL，或关闭省电模式后重试。'); }
  const scene = new Scene(), camera = new OrthographicCamera(), orbit = defaultOrbit(), shapes = new Shapes();
  let environment: CampEnvironment | null = null;
  let weatherEffects: WeatherEffects | null = null;
  const companions = new Map<NpcId, CompanionRig>();
  let state = initial, width = 1, height = 1, frameId = 0, disposed = false, contextLost = false;
  let dirty = true, lastTime = 0, animationTime = initial.elapsed, simulationRate = 1, lastRender = 0, frames = 0, fpsWindow = 0, measuredFps = 0;
  let observer: ResizeObserver | null = null;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)'); let reducedMotion = reduce.matches;
  const canvas = renderer.domElement; canvas.className = 'scene-canvas'; canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.renderer = 'three.js'; canvas.dataset.dimension = '3';
  // Both projected HTML controls and the canvas belong to one gesture surface.
  // Fixed camera, pause and retry controls are intentionally outside worldTarget().
  const inputSurface = host.parentElement ?? host;
  const raycaster = new Raycaster(), pointerNdc = new Vector2(), labelPosition = new Vector3();
  type TapTarget = { kind: 'npc'; id: NpcId } | { kind: 'action'; id: ActionId } | { kind: 'ground' };
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; target: TapTarget }>();
  let moved = false, pinchDistance = 0;
  let sun: DirectionalLight, ambient: HemisphereLight;
  const sunDay = new Color('#fff0d5'), sunNight = new Color('#b8ccdc');
  const sunCloud = new Color('#c8d3dd'), skyDay = new Color('#344b46'), skyStorm = new Color('#32454d');
  const fogDay = new Color('#687b70'), fogStorm = new Color('#51656b');

  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, host.clientWidth < 768 ? 1.6 : 1.8));
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
    scene.background = skyDay.clone(); scene.fog = new Fog(fogDay, 175, 345);
    ambient = new HemisphereLight('#cbdde1', '#534832', 1.20); scene.add(ambient);
    sun = new DirectionalLight(sunDay, 2.38); sun.position.set(-38, 68, 35); sun.target.position.set(0, 0, 5);
    sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -64, right: 64, top: 64, bottom: -64, near: 1, far: 160 });
    sun.shadow.bias = -.00025; sun.shadow.normalBias = .095; sun.shadow.radius = 3.0; scene.add(sun, sun.target);
    const fill = new DirectionalLight('#b4cbd6', .78); fill.position.set(28, 35, -48); scene.add(fill);
    environment = createEnvironment(shapes); scene.add(environment.group);
    weatherEffects = createWeatherEffects(environment.rainSurfaces); scene.add(weatherEffects.group);
    for (const npc of state.npcs) { const rig = createCompanion(npc.id, shapes); companions.set(npc.id, rig); scene.add(rig.root); }
    host.appendChild(canvas);
    inputSurface.addEventListener('pointerdown', pointerDown); inputSurface.addEventListener('pointermove', pointerMove);
    inputSurface.addEventListener('pointerup', pointerUp); inputSurface.addEventListener('pointercancel', pointerCancel);
    inputSurface.addEventListener('lostpointercapture', pointerCancel);
    inputSurface.addEventListener('click', worldClick, true); inputSurface.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
    document.addEventListener('visibilitychange', visibility); reduce.addEventListener('change', motionChange);
    observer = new ResizeObserver(resize); observer.observe(host); resize(); callbacks.onStatus('ready');
    frameId = requestAnimationFrame(frame);
  } catch (error) { dispose(); throw error; }

  function resize() {
    if (disposed) return;
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false); cameraChanged();
  }
  function frame(now: number) {
    frameId = 0; if (disposed || contextLost || document.hidden) return;
    const dt = Math.min(.06, Math.max(0, (now - (lastTime || now)) / 1000)); lastTime = now;
    const interval = width < 768 ? 1000 / 30 : 1000 / 60;
    const animated = state.status === 'playing' && !reducedMotion;
    if ((animated || dirty) && (now - lastRender >= interval - 1 || dirty)) {
      const renderDt = Math.min(.09, Math.max(dt, (now - (lastRender || now)) / 1000)); lastRender = now;
      // Interpolate the authoritative simulation clock, including 2×/4× speed. Pausing keeps its exact phase.
      if (animated) animationTime = Math.min(state.elapsed, animationTime + renderDt * simulationRate);
      else if (reducedMotion && state.status === 'playing') animationTime = state.elapsed;
      try { render(renderDt, now); dirty = false; }
      catch { contextLost = true; callbacks.onStatus('error', '营地画面暂时中断，旅程进度仍然保留。请重试绘制。'); return; }
    }
    frameId = requestAnimationFrame(frame);
  }
  function render(dt: number, now: number) {
    if (!environment) return;
    const playing = state.status === 'playing';
    const night = Math.max(0, Math.sin(Math.max(0, state.elapsed / Math.max(1, state.duration) - .14) * Math.PI * 1.18));
    const cloud = state.atmosphere.cloudCover;
    environment.update(animationTime, state, reducedMotion);
    const flash = weatherEffects?.update(animationTime, state, reducedMotion) ?? 0;
    const cloudShadow = cloud * (reducedMotion ? .92 : .92 + Math.sin(animationTime * .16) * .08);
    sun.color.copy(sunDay).lerp(sunNight, night * .64).lerp(sunCloud, cloud * .55);
    sun.intensity = (2.38 - night * 1.49) * (1 - cloudShadow * .62) + flash * 2.1;
    ambient.intensity = (1.20 - night * .48) * (1 - cloud * .19) + flash * .6;
    renderer.toneMappingExposure = 1.04 - night * .09 + flash * .07;
    (scene.background as Color).copy(skyDay).lerp(skyStorm, cloud).multiplyScalar(1 - night * .2);
    (scene.fog as Fog).color.copy(fogDay).lerp(fogStorm, cloud).multiplyScalar(1 - night * .16);
    for (const npc of state.npcs) { const rig = companions.get(npc.id); if (rig) updateCompanion(rig, npc, dt, animationTime, state.elapsed, npc.id === state.selectedNpc, playing, reducedMotion, state.atmosphere); }
    canvas.dataset.visualTime = animationTime.toFixed(3); canvas.dataset.lightning = flash.toFixed(3);
    renderer.render(scene, camera);
    callbacks.onProject({
      npcs: Array.from(companions.values()).map(rig => {
        labelPosition.copy(rig.root.position); const feet = projectWorld(camera, labelPosition, width, height);
        labelPosition.y = rig.root.position.y + 7.5; const head = projectWorld(camera, labelPosition, width, height);
        return { id: rig.id, feet, head };
      }),
      markers: environment.markers.map(marker => ({ id: marker.id, point: projectWorld(camera, marker.point, width, height) })),
    });
    frames++; if (!fpsWindow) fpsWindow = now;
    if (now - fpsWindow > 1200) {
      measuredFps = Math.round(frames * 1000 / (now - fpsWindow)); frames = 0; fpsWindow = now;
      canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.triangles = String(renderer.info.render.triangles); canvas.dataset.fps = String(measuredFps);
    }
  }
  function cameraChanged() {
    configureCamera(camera, width, height, orbit); dirty = true;
    // Use the rendered camera's right vector for sound, including after orbit/reset.
    callbacks.onViewDirection?.({ x: camera.matrixWorld.elements[0], y: camera.matrixWorld.elements[2] });
  }
  function local(event: PointerEvent) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function worldTarget(target: EventTarget | null): Element | null {
    return target instanceof Element ? target.closest('[data-scene-action], [data-scene-npc], .scene-canvas, .scene-host') : null;
  }
  function pointerDown(event: PointerEvent) {
    const element = worldTarget(event.target);
    if (!element || contextLost || (event.button !== 0 && event.pointerType === 'mouse')) return;
    const npcId = element.getAttribute('data-scene-npc'), action = element.getAttribute('data-scene-action');
    const target: TapTarget = npcId ? { kind: 'npc', id: npcId as NpcId } : action ? { kind: 'action', id: action as ActionId } : { kind: 'ground' };
    const point = local(event); pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y, target });
    if (pointers.size === 1) { moved = false; pinchDistance = 0; }
    else { moved = true; const p = [...pointers.values()]; pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    inputSurface.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    const old = pointers.get(event.pointerId); if (!old) return;
    const point = local(event), dx = point.x - old.x, dy = point.y - old.y;
    if (Math.hypot(point.x - old.startX, point.y - old.startY) > 6) moved = true;
    pointers.set(event.pointerId, { ...old, ...point });
    if (pointers.size > 1) {
      const p = [...pointers.values()], distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDistance > 0) orbit.zoom = MathUtils.clamp(orbit.zoom * distance / pinchDistance, .7, 2.2);
      pinchDistance = distance; orbit.azimuth -= dx * .0018; cameraChanged();
    } else if (moved) {
      orbit.azimuth -= dx * .0055; orbit.elevation = MathUtils.clamp(orbit.elevation + dy * .0034, .46, 1.12); cameraChanged();
    }
  }
  function pointerUp(event: PointerEvent) {
    const start = pointers.get(event.pointerId), point = local(event);
    if (start && Math.hypot(point.x - start.startX, point.y - start.startY) > 6) moved = true;
    const tap = !!start && !moved && pointers.size === 1; pointers.delete(event.pointerId);
    if (inputSurface.hasPointerCapture(event.pointerId)) inputSurface.releasePointerCapture(event.pointerId);
    if (tap && start && ['playing', 'paused'].includes(state.status)) {
      // Forgiving 44 px HTML targets may overlap in portrait. The body actually
      // beneath the finger has priority over the neighboring transparent button.
      if (start.target.kind === 'npc') callbacks.onSelect(companionAt(point.x, point.y) ?? start.target.id);
      else if (start.target.kind === 'action') callbacks.onAssign(start.target.id);
      else pick(point.x, point.y);
    }
  }
  function pointerCancel(event: PointerEvent) { pointers.delete(event.pointerId); moved = true; }
  function worldClick(event: MouseEvent) {
    // Pointer taps are resolved once above. detail === 0 retains native keyboard
    // and assistive-technology activation of the React button's onClick handler.
    if (event.detail > 0 && (event.target === inputSurface || worldTarget(event.target))) { event.preventDefault(); event.stopPropagation(); }
  }
  function wheel(event: WheelEvent) {
    if (!worldTarget(event.target)) return;
    event.preventDefault(); orbit.zoom = MathUtils.clamp(orbit.zoom * Math.exp(-event.deltaY * .0013), .7, 2.2); cameraChanged();
  }
  function companionAt(x: number, y: number): NpcId | undefined {
    pointerNdc.set(x / width * 2 - 1, -(y / height) * 2 + 1); raycaster.setFromCamera(pointerNdc, camera);
    for (const actorHit of raycaster.intersectObjects([...companions.values()].map(rig => rig.pivot), true)) {
      let object: Object3D | null = actorHit.object, npcId: NpcId | undefined, visible = true;
      while (object) {
        if (!object.visible) visible = false;
        if (object.userData.npcId) npcId = object.userData.npcId as NpcId;
        object = object.parent;
      }
      if (visible && npcId) return npcId;
    }
    return undefined;
  }
  function pick(x: number, y: number) {
    if (!environment || !['playing', 'paused'].includes(state.status)) return;
    const npcId = companionAt(x, y);
    if (npcId) { callbacks.onSelect(npcId); return; }
    const objectHit = raycaster.intersectObjects(environment.pickables, false)[0];
    // Labels arrange safe work; clicking actual flames/ground keeps deliberate danger reachable.
    if (objectHit?.object.userData.action && objectHit.object.userData.action !== 'fire') { callbacks.onAssign(objectHit.object.userData.action); return; }
    const point = groundFromScreen(camera, x, y, width, height); if (point) callbacks.onMove?.(point);
  }
  function lost(event: Event) { event.preventDefault(); contextLost = true; cancelAnimationFrame(frameId); frameId = 0; callbacks.onStatus('error', '图形连接中断了。旅程仍然保留，点击重试即可重新绘制营地。'); }
  function restored() { if (disposed) return; contextLost = false; renderer.resetState(); dirty = true; lastTime = 0; callbacks.onStatus('ready'); if (!frameId) frameId = requestAnimationFrame(frame); }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; } else if (!disposed && !contextLost && !frameId) { lastTime = 0; dirty = true; frameId = requestAnimationFrame(frame); } }
  function motionChange(event: MediaQueryListEvent) { reducedMotion = event.matches; dirty = true; }
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frameId); observer?.disconnect();
    inputSurface.removeEventListener('pointerdown', pointerDown); inputSurface.removeEventListener('pointermove', pointerMove); inputSurface.removeEventListener('pointerup', pointerUp); inputSurface.removeEventListener('pointercancel', pointerCancel);
    inputSurface.removeEventListener('lostpointercapture', pointerCancel); inputSurface.removeEventListener('click', worldClick, true); inputSurface.removeEventListener('wheel', wheel);
    canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
    document.removeEventListener('visibilitychange', visibility); reduce.removeEventListener('change', motionChange);
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
    const collect = (object: Object3D) => {
      const mesh = object as Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(mat);
      if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
      if (mesh.customDistanceMaterial) materials.add(mesh.customDistanceMaterial);
    };
    scene.traverse(collect); environment?.pickables.forEach(object => object.traverse(collect));
    for (const mat of materials) for (const value of Object.values(mat)) if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as Texture);
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(mat => mat.dispose()); textures.forEach(texture => texture.dispose());
    shapes.dispose(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); pointers.clear(); companions.clear();
  }
  return {
    update(next) {
      if (next.elapsed < state.elapsed || next.seed !== state.seed) {
        animationTime = next.elapsed; simulationRate = 1; companions.forEach(rig => { rig.initialized = false; });
      } else if (next.elapsed > state.elapsed) {
        simulationRate = MathUtils.clamp((next.elapsed - state.elapsed) * 10, 1, 4);
        if (next.elapsed - animationTime > 1.2) animationTime = next.elapsed - .1 * simulationRate;
      }
      state = next; dirty = true;
    },
    resetCamera() { const reset = defaultOrbit(); orbit.azimuth = reset.azimuth; orbit.elevation = reset.elevation; orbit.zoom = reset.zoom; orbit.focus.copy(reset.focus); cameraChanged(); },
    zoom(amount) { orbit.zoom = MathUtils.clamp(orbit.zoom * amount, .7, 2.2); cameraChanged(); },
    stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, fps: measuredFps }; },
    dispose,
  };
}
