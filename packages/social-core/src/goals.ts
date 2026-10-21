import { ensure } from '../../action-runtime/src/json';
import { validId } from '../../action-runtime/src/types';
import type { KnowledgeSnapshot, PersonalGoal } from './types';
const supported = ['survival', 'rest', 'safety', 'food', 'equipment', 'contribution', 'autonomy', 'status', 'affiliation', 'learning', 'exploration', 'care'];
export function reviseGoal(actorId: string, goal: PersonalGoal, goals: PersonalGoal[], knowledge: KnowledgeSnapshot): PersonalGoal[] {
  ensure(goal.actorId === actorId && knowledge.actorId === actorId && validId(goal.id), 'Goal ownership mismatch');
  ensure(supported.includes(goal.kind) && Number.isFinite(goal.priority) && goal.priority >= 0 && goal.priority <= 1 && Number.isFinite(goal.progress) && goal.progress >= 0 && goal.progress <= 1, 'Invalid personal goal');
  ensure(goal.basisRefs.length > 0 && goal.basisRefs.every(ref => Object.hasOwn(knowledge.evidence, ref)), 'Goal requires known evidence');
  const before = goals.find(g => g.id === goal.id);
  ensure(Number.isSafeInteger(goal.revision) && goal.revision === (before?.revision ?? 0) + 1, 'Goal revision conflict');
  return [...goals.filter(g => g.id !== goal.id), structuredClone(goal)];
}
