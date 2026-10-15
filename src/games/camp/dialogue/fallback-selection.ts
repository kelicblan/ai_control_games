import type { DialoguePayload } from '../../../../packages/npc-dialogue/src/types';
import { buildDialoguePrompt } from '../../../../packages/npc-dialogue/src/prompt';
import { cleanCaption } from './language';

const refusal = [
  '别再催我了，这轮我想先歇歇。', '别把活都甩给我，得轮着来。',
  '凭什么总是我，你也听听我的话。', '我不想再硬撑，先把安排说清楚。',
  '这活我先不接，咱们得好好谈谈。', '别替我做决定，我也有自己的想法。',
  '我想歇一歇，分工也该重新商量。', '少催两句，你先听我把话说完。',
];
const complaint = [
  '这安排让我有意见，咱们得说清楚。', '我心里有些不痛快，也想听个说法。',
  '咱们把分工摊开说，别让我闷着。', '有些事我想当面说，你先听听吧。',
  '这事不能总这么拖着，咱们聊聊吧。', '我也有自己的难处，你听我说说。',
  '我对这件事有些意见，想跟你谈谈。', '有些安排我想不明白，先说清楚吧。',
  '我的话还没说完，你也听听看吧。', '咱们得把各自的难处都说明白。',
];
const neutral = [
  '我在听，你把想法慢慢说清楚。', '咱们先把眼前的安排说清楚吧。',
  '有话你就说，我也想听听你的想法。', '别急，咱们一件一件商量吧。',
  '先听听彼此的打算，再往下安排吧。', '眼前的事咱们一起商量着来吧。',
  '这件事你怎么想，我想听听看。', '咱们把话说明白，别各自憋着。',
];
/** The model chooses wording; every option remains subject to the host's fact/stance checks. */
export function buildFallbackSelection(payload: DialoguePayload): DialoguePayload['fallbackSelection'] {
  const kind = payload.publicExpression?.kind;
  const bank = kind === 'refusal' || kind === 'recruit' ? refusal : kind === 'complaint' ? complaint : neutral;
  const choices = bank.filter(text => cleanCaption(text, payload) === text).slice(0, 4);
  if (!choices.length) return undefined;
  return { choices, prompt: buildDialoguePrompt('根据人物的立场选择一句回复，只输出编号，不解释。', [
    { label: '人物', values: [payload.name, payload.persona], limit: 16 },
    { label: '立场', values: [payload.publicExpression?.kind ?? payload.action, payload.publicExpression?.tone ?? payload.emotion], limit: 12 },
    { label: '玩家', values: payload.playerText ? [payload.playerText] : [], limit: 32 },
    { label: '回复', values: choices.map((text, index) => `${index + 1}.${text}`), limit: 38 },
  ]) };
}
