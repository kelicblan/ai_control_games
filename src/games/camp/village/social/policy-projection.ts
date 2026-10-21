import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { KnowledgeSnapshot, PersonalGoal, Relation } from '../../../../../packages/social-core/src/types';
export function projectSocialContext(actorId: string, knowledge: KnowledgeSnapshot, goals: PersonalGoal[], relations: Record<string, Relation> = {}, targetId?: string): Partial<Record<string, number>> {
  ensure(knowledge.actorId === actorId && goals.every(g => g.actorId === actorId), 'Social projection ownership mismatch');
  const result: Record<string, number> = {};
  for (const kind of ['survival', 'rest', 'safety', 'food', 'equipment', 'contribution', 'autonomy', 'status', 'affiliation', 'learning', 'exploration', 'care']) {
    result[`goal_${kind}`] = Math.max(0, ...goals.filter(g => g.kind === kind).map(g => g.priority * (1 - g.progress)));
  }
  const relation = targetId ? relations[targetId] : undefined;
  if (relation) for (const key of ['trust', 'affinity', 'reciprocity', 'rivalry'] as const) result[`${key}_target`] = relation[key];
  if (relations.player) result.trust_player = relations.player.trust;
  return result;
}
