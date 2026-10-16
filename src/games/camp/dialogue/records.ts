import { NPC_IDS,type NpcId } from '../simulation/types';
import type { GameState } from '../simulation/types';

/** Final utterances belong to a conversation, never to a mutable behavior caption. */
export interface DialogueRecord {
  replyToId?:string;
  targetIds?: (NpcId|'player')[];
  id: string;
  npcId: NpcId;
  text: string;
  source: string;
  at: number;
  latencyMs: number;
  threadId?: number;
  lineId?: number;
}
export const socialDialogueId = (threadId: number, lineId: number) => `social:${threadId}:${lineId}`;
export function retainDialogueRecords(records: DialogueRecord[], state: GameState): DialogueRecord[] {
  const activeLines = new Set(state.social.threads.flatMap(thread => thread.lines.map(line => socialDialogueId(thread.id, line.id))));
  const recent = records.slice(-100);
  const recentIds = new Set(recent.map(record => record.id));
  return [...records.filter(record => activeLines.has(record.id) && !recentIds.has(record.id)), ...recent];
}
export function validDialogueRecord(value: DialogueRecord): boolean {
  return !!value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 240
    && (value.replyToId===undefined||value.threadId!==undefined&&typeof value.replyToId==='string'&&/^social:\d+:\d+$/.test(value.replyToId)&&value.replyToId!==value.id)
    && (value.targetIds===undefined||Array.isArray(value.targetIds)&&value.targetIds.length<=NPC_IDS.length+1&&new Set(value.targetIds).size===value.targetIds.length&&value.targetIds.every(id=>id==='player'||NPC_IDS.includes(id)))
    && typeof value.text === 'string' && value.text.length >= 4 && value.text.length <= 48
    && !/[<>\n\ufffd]/.test(value.text)
    && (value.source === 'minimind3' || value.source==='safety' || /^(remote|native):[a-z0-9][a-z0-9._-]{0,63}$/.test(value.source))
    && Number.isFinite(value.at) && value.at >= 0 && Number.isFinite(value.latencyMs) && value.latencyMs >= 0
    && (value.threadId === undefined && value.lineId === undefined
      || Number.isSafeInteger(value.threadId) && Number.isSafeInteger(value.lineId)
        && value.id === socialDialogueId(value.threadId!, value.lineId!));
}
