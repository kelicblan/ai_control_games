import type { PolicyInput } from '../../../../../packages/policy-runtime/src/types';
/** Alpha bootstrap teacher: survival, load, then known resource deficits. No hidden truth. */
export function chooseLifeTeacher(input: PolicyInput): string | null {
  const candidates = input.candidates, state = input.stateFeatures;
  if (!candidates.length) return null;
  const find = (action: string) => candidates.find(c => c.action === action)?.id;
  if (state[2] < .45) return find('REST') ?? candidates[0].id;
  if (find('DEPOSIT')) return find('DEPOSIT')!;
  const craft = candidates.find(c => c.action === 'CRAFT' && c.parameters.recipeId === 'WPN005'); if (craft) return craft.id;
  const free = { wood: state[48], stone: state[49], rope: state[50] };
  const required = { wood: 14, stone: 4, rope: 5 };
  for (const resource of (['rope', 'stone', 'wood'] as const)) {
    // Inventory log scales are frozen at 1000; unknown stock does not invent a surplus.
    const amount = free[resource] < 0 ? 0 : Math.expm1(free[resource] * Math.log1p(1000));
    if (amount + .001 < required[resource]) { const action = find(`GATHER_${resource.toUpperCase()}`); if (action) return action; }
  }
  return find('REST') ?? candidates[0].id;
}
