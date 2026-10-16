import type { Npc } from '../simulation/types';

export function currentSpeechSource(npc: Pick<Npc, 'speech' | 'speechUntil' | 'speechOrigin'>): string {
  const origin = npc.speechOrigin;
  return origin?.text === npc.speech && origin.until === npc.speechUntil ? origin.source : 'template';
}
