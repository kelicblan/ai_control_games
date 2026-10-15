import type { NpcId } from './types';

export interface SocialPersona {
  headline: string; description: string; strength: string; challenge: string; advice: string;
  traits: { fairness: number; autonomy: number; recognition: number; curiosity: number; sensitivity: number };
}
/** Game traits, not psychological diagnoses. Task MLP still receives its trained three traits. */
export const PERSONAS: Record<NpcId, SocialPersona> = {
  tiesheng: {
    headline: '寡言 · 守诺', description: '铁生答应后便踏实完成，惜字如金；不愿随意改变约定，也不擅长安慰人。',
    strength: '勤奋诚实，耐心兑现承诺', challenge: '固执，共情表达较弱', advice: '说清目标，改计划时先解释缘由。',
    traits: { fairness: .76, autonomy: .62, recognition: .35, curiosity: .18, sensitivity: .32 },
  },
  aling: {
    headline: '热心 · 护短', description: '阿绫会先看见伙伴的伤痛和饥饿，温和地照顾大家；安排过于苛刻时也会站出来护着人。',
    strength: '主动照顾同伴', challenge: '容易忽视自身需要，对苛刻安排不满', advice: '照顾好照顾别人的人，给帮助者留休息。',
    traits: { fairness: .88, autonomy: .48, recognition: .48, curiosity: .36, sensitivity: .78 },
  },
  xiaoman: {
    headline: '机灵 · 嘴甜', description: '小满善于找省力办法，说话讨喜，常先谈回报和替班；怕苦避险，也可能夸大自己的贡献。',
    strength: '善提省力办法，会商量条件', challenge: '趋利怕苦，偶尔夸大贡献', advice: '约定可核查的成果和回报。',
    traits: { fairness: .52, autonomy: .68, recognition: .94, curiosity: .72, sensitivity: .66 },
  },
  shenyan: {
    headline: '理性 · 严谨', description: '沈砚按事实和规则做事，勤奋诚实，直接指出分工失衡；不擅安慰，难以接受含糊承诺。',
    strength: '解释依据，重视公平与守约', challenge: '表达生硬，不容含糊与随意变更', advice: '给出依据、明确期限和一致的规则。',
    traits: { fairness: .98, autonomy: .72, recognition: .4, curiosity: .58, sensitivity: .62 },
  },
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
    headline: '油滑 · 自利', description: '老周是会算计的老油条，喜欢接轻活、拖时间，也会拿检查工具当借口；嘴上圆滑，真吃亏时就推责和看风向。',
    strength: '会判断形势，懂得保护自己的利益', challenge: '偷懒掩饰、推卸责任，不可靠的口头保证', advice: '明确一轮工作的成果并核查实情，别仅凭好听的话判断。',
    traits: { fairness: .45, autonomy: .73, recognition: .35, curiosity: .25, sensitivity: .55 },
  },
  linlan: {
    headline: '懒惰 · 偏激', description: '林枫怕累又自我，体力充足也会挑活。连续催促或拒绝休息会让他直接顶撞、擅自停工，还可能煽动同样不满的伙伴。',
    strength: '敢把反对说出口', challenge: '冲动、耐心低，用公平的说辞维护自己的轻松', advice: '给具体且可兑现的安排；一句道歉不能让他马上恢复服从。',
    traits: { fairness: .83, autonomy: .92, recognition: .78, curiosity: .25, sensitivity: .95 },
  },
  aye: {
    headline: '好奇 · 自主', description: '阿野喜欢发现新资源和新办法，期待自己的建议被认真考虑；长时间重复劳动会让他想换个方向。',
    strength: '寻找机会，主动提出办法', challenge: '容易被新发现吸引', advice: '给探索范围和返营期限。',
    traits: { fairness: .4, autonomy: .96, recognition: .58, curiosity: .98, sensitivity: .45 },
  },
};
