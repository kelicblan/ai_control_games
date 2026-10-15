import type { Point } from '../games/camp/simulation/types';
import { lordMoveDirection,LORD_CAMERA_MIN_DISTANCE,LORD_CAMERA_MAX_DISTANCE, type ThirdPersonView } from '../../packages/world-three/src/thirdPerson';

export interface LordInputOptions {
  canvas: HTMLCanvasElement; enabled: () => boolean; view: ThirdPersonView;
  move: (direction: Point) => void; changed: () => void;
}
/** Keyboard intent is refreshed at 5 Hz. No positions or render delta are sent. */
export function bindLordInput({ canvas, enabled, view, move, changed }: LordInputOptions): {stop:()=>void;dispose:()=>void} {
  const keys = new Set<string>(); let pointer: number | null = null, x = 0, y = 0, sent = false;
  const blocked = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]');
  // IMEs can report key="Process"/"Unidentified" for WASD. Physical game controls
  // must use the hardware code; text fields are still excluded above.
  const movementKey = (event: KeyboardEvent) => /^Key[WASD]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
  function send() {
    if (!enabled() || document.hidden || blocked(document.activeElement)) { stop(); return; }
    const right = Number(keys.has('d')) - Number(keys.has('a')), forward = Number(keys.has('w')) - Number(keys.has('s'));
    if (right || forward) { move(lordMoveDirection(right, forward, view.azimuth)); sent = true; }
    else if (sent) { move({ x: 0, y: 0 }); sent = false; }
  }
  function stop() { keys.clear(); if (sent) move({ x: 0, y: 0 }); sent = false; pointer = null; }
  function focus(event: FocusEvent) { if(blocked(event.target))stop(); }
  function down(event: KeyboardEvent) {
    const key = movementKey(event);
    if (!'wasd'.includes(key) || key.length !== 1 || !enabled() || blocked(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!keys.has(key)) { keys.add(key); send(); }
  }
  function up(event: KeyboardEvent) {
    const key = movementKey(event); if (!keys.delete(key)) return;
    event.preventDefault(); event.stopImmediatePropagation(); send();
  }
  function pointerDown(event: PointerEvent) {
    if (!enabled() || ![0, 2].includes(event.button)) return;
    event.preventDefault(); pointer = event.pointerId; x = event.clientX; y = event.clientY; canvas.setPointerCapture(pointer);
  }
  function pointerMove(event: PointerEvent) {
    if (pointer !== event.pointerId || !enabled()) return;
    view.azimuth -= (event.clientX - x) * .0055;
    view.elevation = Math.min(.85, Math.max(.08, view.elevation + (event.clientY - y) * .0034));
    x = event.clientX; y = event.clientY; changed(); if (keys.size) send();
  }
  function pointerUp(event: PointerEvent) { if (pointer !== event.pointerId) return; pointer = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); }
  function wheel(event: WheelEvent) { if (!enabled()) return; event.preventDefault(); view.distance = Math.min(LORD_CAMERA_MAX_DISTANCE, Math.max(LORD_CAMERA_MIN_DISTANCE, view.distance * Math.exp(event.deltaY * .001))); changed(); }
  function menu(event: MouseEvent) { if (enabled()) event.preventDefault(); }
  const timer = window.setInterval(send, 200);
  document.addEventListener('keydown', down, true); document.addEventListener('keyup', up, true);
  window.addEventListener('blur', stop); document.addEventListener('visibilitychange', stop);
  document.addEventListener('focusin',focus);
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', menu);
  return {stop,dispose:() => {
    stop(); clearInterval(timer); document.removeEventListener('keydown', down, true); document.removeEventListener('keyup', up, true);
    window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop);
    document.removeEventListener('focusin',focus);
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('lostpointercapture', pointerUp);
    canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', menu);
  }};
}
