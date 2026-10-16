import { worldCanTraverse } from '../world/navigation';
import type { GameState, LordState, Point } from './types';

export const LORD_MOVE_SPEED = 8;
export const LOCAL_PLAYER_ID = 'local-player' as const;

export function createLord(seed = 1): LordState {
  const spawn = { x: 42, y: 72 };
  // Deterministic nearby fallback keeps migration independent of renderer state.
  for (let radius = 0; radius <= 12; radius += 2) {
    for (let angle = 0; angle < 8; angle++) {
      const point = { x: spawn.x + Math.cos(angle * Math.PI / 4) * radius, y: spawn.y + Math.sin(angle * Math.PI / 4) * radius };
      if (worldCanTraverse(point, point, seed)) return { playerId: LOCAL_PLAYER_ID, name: '领主', position: point, heading: .46 - Math.PI, input: { x: 0, y: 0 } };
    }
  }
  throw new Error('无法找到领主出生位置');
}

export function setLordInput(lord: LordState, direction?: Point): void {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) { lord.input = { x: 0, y: 0 }; return; }
  const length = Math.max(1, Math.hypot(direction.x, direction.y));
  lord.input = { x: direction.x / length, y: direction.y / length };
}

export function stopLord(state: GameState): void {
  if (state.lord) setLordInput(state.lord);
}

/** Direct swept movement, without destination planning or any renderer dependency. */
export function advanceLord(state: GameState, dt: number): void {
  const lord = state.lord;
  if (!lord || state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  setLordInput(lord, lord.input);
  const input = lord.input;
  if (!input.x && !input.y) return;
  lord.heading = Math.atan2(input.x, input.y);
  // Same fixed-step budget as the engine; substeps prevent thin-wall tunnelling.
  const distance = LORD_MOVE_SPEED * Math.min(dt, .25);
  const steps = Math.max(1, Math.ceil(distance / .25));
  const dx = input.x * distance / steps, dy = input.y * distance / steps;
  for (let index = 0; index < steps; index++) {
    const from = lord.position, direct = { x: from.x + dx, y: from.y + dy };
    if (worldCanTraverse(from, direct, state.seed,state.world?.gateOpen??true)) { lord.position = direct; continue; }
    const alongX = { x: from.x + dx, y: from.y };
    if (dx && worldCanTraverse(from, alongX, state.seed,state.world?.gateOpen??true)) lord.position = alongX;
    const alongY = { x: lord.position.x, y: lord.position.y + dy };
    if (dy && worldCanTraverse(lord.position, alongY, state.seed,state.world?.gateOpen??true)) lord.position = alongY;
  }
}
