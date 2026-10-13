import type { Npc } from '../simulation/types';

/** 公开说辞只是表达。即使老周掩饰偷懒，这个函数也没有世界写入能力。 */
export function campExpression(npc: Npc, fallback = '我先看看眼前的事。'): string {
  const mind = npc.mind;
  if (!mind) return fallback;
  const denials = mind.concerns.find(concern => concern.kind === 'rest' && concern.status !== 'resolved')?.denials ?? 0;
  if (mind.intent.kind === 'strike') return npc.id === 'laozhou' ? '大家都不干，那我也先停，别单把账算我头上。' : '这分工我不认。先停下来，重新谈清楚。';
  if (mind.expression.kind === 'recruit' || mind.intent.kind === 'recruit') return npc.id === 'linlan'
    ? '凭什么一直听他使唤？受够的就跟我一起停工！' : '光我一个人说没用，觉得不合理的也站出来。';
  if (mind.expression.allowDeception && mind.expression.kind === 'conceal') return denials
    ? '急什么，工具还得检查。催出毛病可别赖我。' : '这工具得检查一下，我先处理这个，重活找别人搭把手。';
  if (mind.expression.kind === 'refusal' || mind.intent.kind === 'refuse') return npc.id === 'linlan'
    ? denials <= 1 ? '我说要歇一会儿，听不懂？这轮我不干了。'
      : denials === 2 ? '已经拒绝我两次，还指望我装没事？我就歇着。'
        : denials === 3 ? '说了不干还催？爱谁干谁干，我先歇着！'
          : '别再下同一个命令了，我已经停工，爱谁干谁干！'
    : npc.id === 'azhuang' ? '别把我肯出力当成没脾气。这回我先停下。' : '这次我不接受安排，我会先顾好自己。';
  if (mind.intent.kind === 'rest') return denials
    ? npc.id === 'linlan' ? '不让歇是吧？我不等你同意了。' : '我已经说过需要休息，现在先去恢复体力。'
    : npc.id === 'laozhou' ? '人得会省力。我先缓缓，重活晚点再说。' : '我先去休息，恢复以后再谈安排。';
  if (mind.expression.kind === 'bargain') return npc.id === 'laozhou' ? '让我干也行，先说清楚谁替班，别又全落我头上。' : npc.id === 'linlan'
    ? '先把谁接班说清楚，别光叫我继续干。' : '我可以再撑一轮，但要有人接班，不能一直拖。';
  // 同为 complaint，忍耐和主动偷懒仍是不同立场，先表达具体意图再用通用抱怨兜底。
  if (mind.intent.kind === 'endure') return npc.id === 'azhuang' ? '我先把这趟顶完，但你得记得我已经提过休息。' : '这轮我暂时继续，之前提的需要还没解决。';
  if (mind.intent.kind === 'evade') return npc.id === 'linlan' ? '这活又累又烦，先找别人。' : '我先挑眼前轻一点的事，重活再说。';
  if (mind.expression.kind === 'complaint') return npc.id === 'linlan' ? '又催我？别人怎么就能闲着？' : npc.id === 'laozhou'
    ? '这事可不能光怪我，安排的人也得负点责任。' : '我的不满还在，换句话说并不能解决。';
  if (mind.expression.kind === 'request') {
    if (mind.expression.concern === 'rest') return npc.id === 'linlan' ? '干够了，我要歇会儿。别什么活都往我这儿塞。'
      : npc.id === 'laozhou' ? '我这边也累着呢，重活换个人接吧。' : npc.id === 'azhuang' ? '我还能顶一阵，但得商量好换班。' : '我需要歇一会儿，接下来能换个人吗？';
    if (mind.expression.concern === 'food') return '我得先吃点东西，肚子饿得受不了了。';
    if (mind.expression.concern === 'safety') return '这天气下继续硬撑太危险，我得先找地方避一避。';
    if (mind.expression.concern === 'fairness') return npc.id === 'linlan' ? '为什么又轮到我？这分工我有意见。' : '这轮付出有些不均，得把分工谈清楚。';
  }
  if (mind.intent.kind === 'cooperate' && ['wood', 'food', 'fire', 'help', 'explore'].includes(mind.intent.actionId ?? '')) {
    if (npc.id === 'linlan') return '行，这趟我干，别接着什么都往我头上派。';
    if (npc.id === 'laozhou') return '这趟我来一回，可别当成以后都归我。';
  }
  return fallback;
}
