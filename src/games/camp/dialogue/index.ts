/** 权威端共用的对话上下文与提交校验，不包含浏览器推理后端。 */
export * from './context';
export type { DialoguePayload, DialogueReply } from '../../../../packages/npc-dialogue/src/types';
export { applyDialogue, validDialogueLine } from './commit';
