import { digest, ensure } from '../../../../../packages/action-runtime/src/json';
import type { ActionCommand } from '../../../../../packages/action-runtime/src/types';
import type { PolicyInput } from '../../../../../packages/policy-runtime/src/types';
export interface DecisionGroup { operationId: string; executionId: string | null; proposed: ActionCommand; executed: ActionCommand | null;
  source: ActionCommand['source']; rawScores: Record<string, number>; modelId: string | null; modelHash: string | null; overrideReason: string | null;
  before: PolicyInput; after: PolicyInput; status: string; truncated: boolean }
export function recordDecision(groups: DecisionGroup[], group: DecisionGroup): void {
  ensure(group.before.actorId === group.proposed.actorId && group.after.actorId === group.proposed.actorId && group.operationId === group.proposed.operationId, 'Trajectory identity mismatch');
  digest(group); groups.push(structuredClone(group));
}
