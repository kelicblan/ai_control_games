import { digest, ensure } from '../../action-runtime/src/json';
import { validId } from '../../action-runtime/src/types';
export interface Institution { id: string; version: number; kind: 'equipment-use' | 'guard-duty' | 'temporary-team'; issuerId: string; members: string[]; itemIds: string[]; effectiveAt: number; expiresAt: number; basisRefs: string[] }
export interface InstitutionConsent { actorId: string; termsHash: string; response: 'accept' | 'decline' }
export const institutionHash = (change: Institution) => digest(change);
export function applyInstitution(change: Institution, consents: InstitutionConsent[], rules: Record<string, Institution>) {
  try {
    ensure(validId(change.id) && validId(change.issuerId) && ['equipment-use', 'guard-duty', 'temporary-team'].includes(change.kind) && change.members.length > 0 && change.members.length <= 11 && new Set(change.members).size === change.members.length && change.members.includes(change.issuerId) && change.members.every(validId) && change.itemIds.every(validId) && change.basisRefs.length > 0 && change.basisRefs.every(validId), 'Invalid institution');
    ensure(Number.isSafeInteger(change.version) && change.version >= 1 && Number.isFinite(change.effectiveAt) && change.effectiveAt >= 0 && Number.isFinite(change.expiresAt) && change.expiresAt > change.effectiveAt, 'Invalid institution lifetime');
    const old = rules[change.id]; if (old && institutionHash(old) === institutionHash(change)) return { ok: true as const, rules };
    ensure(change.version === (old?.version ?? 0) + 1, 'Institution revision conflict');
    const terms = institutionHash(change);
    ensure(change.members.every(id => consents.filter(c => c.actorId === id && c.termsHash === terms).at(-1)?.response === 'accept'), 'Missing independent institution consent');
    return { ok: true as const, rules: { ...rules, [change.id]: structuredClone(change) } };
  } catch (e) { return { ok: false as const, rules, reason: e instanceof Error ? e.message : 'Institution rejected' }; }
}
export function authorizeResourceUse(rules: Record<string, Institution>, actorId: string, itemId: string, at: number) {
  const rule = Object.values(rules).filter(r => r.kind === 'equipment-use' && r.members.includes(actorId) && r.itemIds.includes(itemId) && r.effectiveAt <= at && at < r.expiresAt).sort((a, b) => b.version - a.version || a.id.localeCompare(b.id))[0];
  return { allowed: !!rule, basisRefs: rule?.basisRefs ?? [], ruleVersion: rule ? `${rule.id}:${rule.version}` : 'none', ...(!rule ? { reason: 'No current use right' } : {}) };
}
