import type { GameState } from '../simulation/types';
import type { DialogueTicket } from './context';
import { revision, fingerprint, intentFingerprint, captionWithinWindow, createDialogueTicket } from './context';
import { cleanCaption } from './language';
import { buildFallbackSelection } from './fallback-selection';
export type DialogueSource = 'minimind3' | 'cache' | 'safety' | `native:${string}` | `remote:${string}`;

/** 提交前再次核验世界/意图/表达修订；只改字幕与对应记录，不改任务或资源。 */
export function validDialogueLine(text: unknown): text is string {
  if(text==='** **')return true;
  return typeof text === 'string' && text.length >= 4 && text.length <= 48
    && /[\u4e00-\u9fff]/.test(text) && /[。！？!?]$/.test(text)
    && !/[<>\n\ufffd]/.test(text) && !/金币|奖励|玩家获得|系统提示|台词[:：]/.test(text);
}
export function applyDialogue(state: GameState, ticket: DialogueTicket, text: string,
  source: DialogueSource = 'minimind3', conversationThreadId: number | null = null): GameState {
  const npc = state.npcs.find(n => n.id === ticket.npcId);
  const thread = state.social.threads.find(item => item.id === ticket.threadId);
  const line = thread?.lines.find(item => item.id === ticket.lineId);
  const pausedConversation = state.status === 'paused' && ticket.threadId !== undefined
    && ticket.threadId === conversationThreadId;
  // Only the model-selected, host-written candidate bank can be revalidated against
  // current physical facts. Free-form/provider and social replies retain exact context checks.
  const currentCandidate = npc && source === 'minimind3' && ticket.threadId === undefined
    && intentFingerprint(state, npc) === ticket.intentFingerprint
    && buildFallbackSelection(createDialogueTicket(state, npc).payload)?.choices.includes(text);
  if ((state.status !== 'playing' && !pausedConversation) || !npc?.alive || !validDialogueLine(text) || cleanCaption(text, ticket.payload) !== text
    || npc.speech === text || revision(npc) !== ticket.revision
    || (!currentCandidate && fingerprint(state, npc) !== ticket.fingerprint) || !captionWithinWindow(npc, state.elapsed, ticket.threadId)
    || (npc.collision?.reactionUntil ?? 0) > state.elapsed) return state;
  if (ticket.threadId !== undefined && (!thread || thread.revision !== ticket.threadRevision
    || line?.speaker !== npc.id || line.text !== npc.speech)) return state;
  return { ...state, ...(thread ? { social: { ...state.social,
    threads: state.social.threads.map(item => item.id === thread.id ? { ...item,
      lines: item.lines.map(itemLine => itemLine.id === line!.id ? { ...itemLine, text, source } : itemLine),
    } : item) } } : {}), npcs: state.npcs.map(n => n.id === npc.id
    ? { ...n, speech: text, speechUntil: Math.max(n.speechUntil, state.elapsed + 3.5),
      speechOrigin: { text, until: Math.max(n.speechUntil, state.elapsed + 3.5), source } } : n) };
}
