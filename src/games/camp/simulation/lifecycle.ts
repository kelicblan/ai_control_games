import type { GameState } from './types';

/** Legacy terminal states are readable saves, never terminal worlds in the current game. */
export function restoreContinuousWorld(state: GameState): void {
  if (state.status !== 'won' && state.status !== 'lost') return;
  state.status = 'paused';
  state.resultReason = '';
}
