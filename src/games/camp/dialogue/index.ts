/** 营地对话门面；应用层不需要知道通用调度与浏览器后端如何组合。 */
export * from './service';
export * from './context';
export { applyDialogue, validDialogueLine } from './commit';
