import type { DialoguePayload, DialogueReply } from '../../../packages/npc-dialogue/src/types';
import type { ModelProgress } from './assets';

export type ModelCommand = { id: number; type: 'prepare'; base: string }
  | { id: number; type: 'generate'; payload: DialoguePayload }
  | { id: number; type: 'cancel' };
export type ModelMessage = { id: number; type: 'progress'; value: ModelProgress }
  | { id: number; type: 'result'; value?: DialogueReply }
  | { id: number; type: 'error'; error: string; outcome?: 'busy' | 'skipped' };
export class DialogueRequestError extends Error {
  constructor(readonly status: number, readonly outcome?: 'busy' | 'skipped', message = '本地台词模型未就绪') { super(message); }
}
