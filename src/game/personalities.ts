import type { NpcId } from './types';

export interface SocialPersona {
  headline: string; description: string; strength: string; challenge: string; advice: string;
  traits: { fairness: number; autonomy: number; recognition: number; curiosity: number; sensitivity: number };
}
/** Game traits, not psychological diagnoses. Task MLP still receives its trained three traits. */
export const PERSONAS: Record<NpcId, SocialPersona> = {
  azhuang: {
    headline: '好强 · 讲义气', description: '阿壮愿意扛起困难，也希望自己的付出被看见；容易逞强，公开责备会让他受挫。',
    strength: '危急时愿意挺身而出', challenge: '受累也硬撑，在意付出被忽视', advice: '认可具体贡献，提前约好换班。',
    traits: { fairness: .72, autonomy: .54, recognition: .96, curiosity: .28, sensitivity: .58 },
  },
  xiaomi: {
    headline: '谨慎 · 细致', description: '小米重视安全，愿意为准备充分的计划行动；希望大家认真听她对风雨和伤势的担忧。',
    strength: '留意风险，做事细致', challenge: '信息不足时容易担心', advice: '解释安排，给她可靠的退路。',
    traits: { fairness: .58, autonomy: .35, recognition: .42, curiosity: .38, sensitivity: .95 },
  },
  laozhou: {
    headline: '热心 · 包容', description: '老周总想照顾每个人，不善拒绝求助；有时会忘记自己的体力和已经答应的工作。',
    strength: '照顾伙伴，愿意补位', challenge: '答应太多，容易透支自己', advice: '分清轻重，替他安排休息。',
    traits: { fairness: .7, autonomy: .24, recognition: .25, curiosity: .3, sensitivity: .6 },
  },
  linlan: {
    headline: '公正 · 守约', description: '林岚重视公平与承诺，分工讲依据；她愿意接受有解释的例外，也会替过度承担的人提出异议。',
    strength: '分工有条理，维护承诺', challenge: '对偏袒和含糊安排不满', advice: '说明理由，让补偿落到实处。',
    traits: { fairness: .98, autonomy: .63, recognition: .44, curiosity: .35, sensitivity: .65 },
  },
  aye: {
    headline: '好奇 · 自主', description: '阿野喜欢发现新资源和新办法，期待自己的建议被认真考虑；长时间重复劳动会让他想换个方向。',
    strength: '寻找机会，主动提出办法', challenge: '容易被新发现吸引', advice: '给探索范围和返营期限。',
    traits: { fairness: .4, autonomy: .96, recognition: .58, curiosity: .98, sensitivity: .45 },
  },
};
