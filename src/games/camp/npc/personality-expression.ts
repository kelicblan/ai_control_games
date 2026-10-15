import type { Npc } from '../simulation/types';
import { getCampProfile, hasCustomCampTraits } from './profiles';

const newcomers = new Set<Npc['id']>(['tiesheng', 'aling', 'xiaoman', 'shenyan']);
type Style = 'steady' | 'caring' | 'bargaining' | 'reasoned' | 'plain';

/** Numeric traits select the style, so changing a template also changes its voice. */
function styleFor(npc: Npc): Style {
  const t = getCampProfile(npc).traits;
  if (t.empathy >= .85) return 'caring';
  if (t.diligence >= .85 && t.patience >= .85) return 'steady';
  if (t.fairness >= .9 && t.honesty >= .85) return 'reasoned';
  if (t.selfInterest >= .7 && t.diligence < .5) return 'bargaining';
  return 'plain';
}

export function personalityCheckin(npc: Npc, fallback: string): string {
  if (!newcomers.has(npc.id) && !hasCustomCampTraits(npc)) return fallback;
  switch (styleFor(npc)) {
    case 'steady': return '说好的活，我会做完。改安排，先跟我说。';
    case 'caring': return '大家还好吗？谁受伤或没吃上，咱们先照应一下，也别让人一直硬撑。';
    case 'bargaining': return '我有个省力的主意，咱们商量商量？做多少、谁替班，先说好嘛。';
    case 'reasoned': return '先核对库存、体力和已完成的工作，再按同一规则分工。承诺请给明确期限。';
    default: return '我们按眼前的需要商量分工，也把各自的安排说清楚。';
  }
}

/** Decorate an already factual response without changing acceptance or world facts. */
export function personalityAcknowledgement(npc: Npc, fact: string): string {
  if (!newcomers.has(npc.id) && !hasCustomCampTraits(npc)) return fact;
  switch (styleFor(npc)) {
    case 'steady': return `我直说：${fact}`;
    case 'caring': return `咱们慢慢说：${fact}`;
    case 'bargaining': return `我琢磨着呀：${fact}`;
    case 'reasoned': return `按目前的情况：${fact}`;
    default: return fact;
  }
}

/** The mind decides acceptance first; these lines only express that existing intent. */
export function personalityExpression(npc: Npc): string | undefined {
  if (!newcomers.has(npc.id)) return undefined;
  const mind = npc.mind;
  if (!mind || mind.intent.kind === 'strike' || mind.intent.kind === 'recruit' || mind.expression.kind === 'recruit') return undefined;
  const style = styleFor(npc);
  if (mind.intent.kind === 'refuse' || mind.expression.kind === 'refusal') return ({
    steady: '这次不接。先把需要处理好，再谈安排。',
    caring: '这次我先不接了。不能让人一直硬撑，先把需要照顾好。',
    bargaining: '这轮我先不接啦，自己的需要也得顾到，再商量条件吧。',
    reasoned: '我拒绝这次安排。当前需要尚未解决，请先明确调整办法。',
    plain: '这次我不会接受安排，先处理自己的需要。',
  })[style];
  if (mind.intent.kind === 'endure') return ({
    steady: '这轮做完。提过的需要，别忘了。',
    caring: '我先把这轮撑完，也请记着大家都需要歇脚。',
    bargaining: '那我先顶这一轮呀，之前提的需要可别忘了。',
    reasoned: '我暂时完成本轮职责，但此前提出的需要仍待解决。',
    plain: '我先把这轮做完，之前的需要还请记着。',
  })[style];
  if (mind.expression.kind === 'bargain') return ({
    steady: '先说谁接班，再谈继续。', caring: '可以商量继续，但先安排换班，别把人累坏。',
    bargaining: '要我再做一轮也能商量，谁替班、怎么补偿，先说好呀。',
    reasoned: '继续工作的条件是明确换班安排和兑现期限。', plain: '先明确换班条件，再谈继续。',
  })[style];
  if (mind.expression.allowDeception && mind.expression.kind === 'conceal' && getCampProfile(npc).traits.honesty < .5)
    return '别急嘛，我在琢磨省力的办法，重活先找人搭把手呀。';
  return undefined;
}
