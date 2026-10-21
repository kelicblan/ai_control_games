import { canonical } from '../../action-runtime/src/json';
import { validId } from '../../action-runtime/src/types';
import { proposalTermsHash, validateProposalShape } from './contracts';
import type { ConsentRecord, SocialProposal } from './types';
export interface ConsentReceipt { accepted: boolean; reason?: string; records: ConsentRecord[] }
export function recordConsent(consent: ConsentRecord, proposal: SocialProposal, records: ConsentRecord[]): ConsentReceipt {
  const reject = (reason: string): ConsentReceipt => ({ accepted: false, reason, records: structuredClone(records) });
  if (!validateProposalShape(proposal).ok || !validId(consent.operationId) || !proposal.parties.includes(consent.actorId)
    || !['accept', 'decline'].includes(consent.response) || consent.proposalId !== proposal.id || consent.proposalVersion !== proposal.version || consent.termsHash !== proposalTermsHash(proposal)) return reject('Consent scope or terms changed');
  const old = records.find(r => r.operationId === consent.operationId);
  if (old) return canonical(old) === canonical(consent) ? { accepted: true, records: structuredClone(records) } : reject('Consent operation reused with different terms');
  return { accepted: true, records: [...structuredClone(records), structuredClone(consent)] };
}
