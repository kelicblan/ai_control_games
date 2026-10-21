import contract from './contract.json';
import type { PolicyInput } from '../../../../../packages/policy-runtime/src/types';
/** Explainable bootstrap only. It sees the same bounded observation as the model. */
export function chooseTacticalTeacher(input: PolicyInput): string | null {
  const names = contract.tactical.stateGroups.flatMap(g => contract.stateGroups[g as keyof typeof contract.stateGroups].map(f => f.id));
  const hp = input.stateFeatures[names.indexOf('hp_ratio')];
  const numeric = (c: PolicyInput['candidates'][number], field: string) => c.features[32 + contract.candidateNumeric.findIndex(f => f.id === field)];
  const score = (c: PolicyInput['candidates'][number]) => {
    if(c.action==='SEEK_SHELTER')return 80;
    if(c.action==='GUARD'&&numeric(c,'urgency')>.9)return 55;
    if (c.action === 'RETREAT') return hp < .3 ? 100 : -10;
    if (c.action === 'RESCUE') return (hp > .6 ? 70 : 5)+Math.max(0,numeric(c,'trust_target'))*5;
    if (c.action === 'HEAL') return c.targetId === input.actorId ? 90 : hp > .5 ? 60 : 5;
    if (c.action === 'ATTACK') return numeric(c, 'cooldown_ready') > .5 ? 50 - numeric(c, 'distance_log') * 10 : -5;
    if (c.action === 'REPOSITION') return 20 + numeric(c, 'range_margin_norm') * 5 - numeric(c, 'distance_log');
    if (c.action === 'REPAIR_FENCE') return 30;
    return c.action === 'WAIT' ? 0 : -20;
  };
  return [...input.candidates].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0]?.id ?? null;
}
