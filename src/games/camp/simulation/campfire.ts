import type { GameState } from './types';

/** Display only. Keep the saved field and model output slot compatible with older versions. */
export function syncCampfire(state: GameState): void {
  state.fire = state.wood > 0 ? 100 : 0;
  state.social.agreements = state.social.agreements.filter(agreement => agreement.action !== 'fire');
  for (const npc of state.npcs) {
    if (npc.command === 'fire') npc.command = null;
    if (npc.action !== 'fire') continue;
    npc.action = null;
    npc.progress = 0;
    npc.actionDuration = 0;
    npc.decisionIn = 0;
    npc.destination = { ...npc.position };
    delete npc.worldRoute;
  }
}

