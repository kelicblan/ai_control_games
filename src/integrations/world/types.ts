import type { GameCommand, GameOptions, GameState, NpcId } from '../../games/camp/simulation/types';
import type { DialogueSource } from '../../games/camp/dialogue/commit';
import type { DialogueRecord } from '../../games/camp/dialogue/records';

export type WorldAction =
  | { type:'social-choice';setId:string;choiceId:string;scope:string }
  | { type:'social-refresh';setId:string;scope:string }
  | { type: 'dialogue-result'; scope: string; result: DialogueRecord }
  | { type:'agency-model'; modelId:string }
  | { type:'agency-settings'; enabled:boolean; cognition:boolean; modelId:string|null }
  | { type: 'start'; options: GameOptions }
  | { type: 'reset'; npcSettings?: GameOptions['npcSettings'] }
  | { type: 'import'; state: GameState }
  | { type: 'command'; command: GameCommand }
  | { type: 'pause'; paused: boolean; temporary?: boolean }
  | { type: 'speed'; speed: number }
  | { type: 'caption'; npcId: NpcId; beforeSpeech: string; beforeUntil: number; beforeFingerprint: string; text: string; source: DialogueSource; threadId?: number; lineId?: number };

export interface WorldSnapshot {
  serverDialogue?:boolean;
  moderationVersion?:string;
  dialogueScope?: string;
  dialogues?: DialogueRecord[];
  state: GameState | null;
  revision: number;
  speed: number;
  savedAt: number;
  recovered: boolean;
  temporaryPause: boolean;
  catchingUp: boolean;
}
