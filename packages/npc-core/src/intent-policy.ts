import type { BehaviorIntent } from './types';
export function sampleIntent(randomState: number, scores: Partial<Record<BehaviorIntent,number>>, legal: readonly BehaviorIntent[]) {
  const unique = [...new Set(legal)];
  if (!unique.length) throw new Error('No legal intent');
  const weights = unique.map(intent=>({intent, weight:Math.exp(Math.max(-8,Math.min(8,Number.isFinite(scores[intent]) ? scores[intent]! : -8)))}));
  const total = weights.reduce((s,c)=>s+c.weight,0);
  const candidates = weights.map(c=>({intent:c.intent,probability:c.weight/total}));
  const randomAfter = (Math.imul(randomState,1664525)+1013904223)>>>0;
  let draw = randomAfter/4294967296, selected = candidates[candidates.length-1].intent;
  for (const c of candidates) { draw-=c.probability; if(draw<=0){selected=c.intent;break;} }
  return {candidates,selected,randomBefore:randomState,randomAfter};
}
