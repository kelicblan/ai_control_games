import type { Npc } from '../simulation/types';
import { getCampProfile } from '../npc/profiles';

/** 自定义角色只按本局立场与人格表达，不继续套用“林枫必然顶撞”等身份分支。 */
export function customCampExpression(npc: Npc, fallback: string): string {
  const mind = npc.mind;
  if (!mind) return fallback;
  const traits = getCampProfile(npc).traits;
  const harsh = traits.impulsivity >= .65 && mind.emotions.anger >= .3;
  const expression = mind.expression.kind;
  if (mind.intent.kind === 'strike') return '大家的需要还没解决，我也先停工，重新谈安排。';
  if (expression === 'recruit' || mind.intent.kind === 'recruit') return harsh ? '受够这个安排了，有意见的就一起站出来！' : '觉得分工有问题的伙伴，我们一起把需要说清楚。';
  if (mind.expression.allowDeception && expression === 'conceal' && traits.honesty < .5) return '还有些准备没做好，重活你先找别人接一下。';
  if (expression === 'refusal' || mind.intent.kind === 'refuse') return harsh ? '已经说不干了，别再催！' : '这次我不会接受这个安排，先处理自己的需要。';
  if (mind.intent.kind === 'rest') return '我先去恢复体力，剩下的安排之后再谈。';
  if (expression === 'bargain') return '可以继续，但请先把换班和约定讲清楚。';
  if (mind.intent.kind === 'endure') return '我先把这轮做完，之前提出的需要也请记着。';
  if (mind.intent.kind === 'evade') return '我想先做轻一点的事，暂时不接重活。';
  if (expression === 'complaint') return harsh ? '又是这种安排，我已经够烦了！' : '这个安排仍让我不满，需要实际调整。';
  if (expression === 'request') {
    if (mind.expression.concern === 'rest') return '我需要休息，能安排换班吗？';
    if (mind.expression.concern === 'food') return '我饿了，想先解决吃饭的问题。';
    if (mind.expression.concern === 'safety') return '现在的风险让我不踏实，先商量安全的办法。';
    return '我想谈谈眼前的分工和各自的需要。';
  }
  return fallback;
}
