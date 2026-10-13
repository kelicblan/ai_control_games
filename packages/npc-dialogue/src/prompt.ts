/** 删除 ChatML 分隔符入口和换行，限制每段长度；宿主提供语言和领域内容。 */
export const promptText = (text: string, limit: number) => text.replace(/[<>\r\n]/g, '').slice(0, limit);
export interface PromptSection { label: string; values: readonly string[]; limit?: number }
/** 通用 ChatML 编排：不认识森林、餐厅、人物、任务或任何资源名称。 */
export function buildDialoguePrompt(system: string, sections: readonly PromptSection[], prefix = ''): string {
  const user = sections.filter(section => section.values.length).map(section => `${promptText(section.label, 30)}：${section.values.map(value => promptText(value, section.limit ?? 120)).join('；')}`).join('。');
  return `<|im_start|>system\n${promptText(system, 700)}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n${promptText(prefix, 40)}`;
}
/** 仅做输出外形校验；领域事实与角色立场须由宿主在提交时再次核验。 */
export function cleanDialogueText(raw: string, maximum = 48): string {
  if (/[<>\ufffd]/.test(raw)) return '';
  const text = raw.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').match(/^[^\n。！？!?]*[。！？!?]/)?.[0] ?? '';
  return text.length >= 4 && text.length <= maximum ? text : '';
}
