import { digest, ensure } from '../../action-runtime/src/json';
import type { SocialIssue } from './types';
export function ensureIssue(issues: Record<string, SocialIssue>, input: { actorId: string; reason: string; participants: string[]; basisRefs: string[] }): SocialIssue {
  ensure(input.participants.includes(input.actorId) && input.basisRefs.length > 0, 'Issue requires actor and evidence');
  const id = `issue:${digest({ ...input, participants: [...input.participants].sort(), basisRefs: [...input.basisRefs].sort() }).slice(0, 24)}`;
  return issues[id] ??= { id, participants: [...input.participants], status: 'open', revision: 1, basisRefs: [...input.basisRefs], reasonKey: digest({ actorId: input.actorId, reason: input.reason, participants: [...input.participants].sort() }) };
}
