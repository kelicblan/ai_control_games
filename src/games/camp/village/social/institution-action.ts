import { applyInstitution, institutionHash, type Institution } from '../../../../../packages/social-core/src/institutions';
import { activatePlan } from '../../../../../packages/social-core/src/contracts';
import { ensure, record } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
export const INSTITUTION_CAPABILITY: ActionCapability<VillageState> = {
  id: 'ACCEPT_REQUEST', validate(state, command) {
    ensure(command.source === 'active_plan' && command.planId && record(command.parameters.institution), 'Institution requires an independently accepted plan');
    const plan = state.social.plans[command.planId], proposal = plan && state.social.proposals[plan.proposalId];
    ensure(proposal && activatePlan(proposal, state.social.consents), 'Missing institution agreement');
    const change = command.parameters.institution as unknown as Institution;
    ensure(change.issuerId === command.actorId && change.members.every(id => proposal.parties.includes(id)) && change.members.every(id => state.actors[id]) && change.basisRefs.every(ref => proposal.basisRefs.includes(ref)), 'Institution exceeds consent scope');
    for (const id of change.itemIds) ensure(state.economy?.items[id]?.ownerId === change.issuerId, 'Institution cannot grant another owner property');
    const result = applyInstitution(change, change.members.map(actorId => ({ actorId, termsHash: institutionHash(change), response: 'accept' })), state.institutions ?? {});
    ensure(result.ok, result.reason ?? 'Invalid institution');
    return { duration: .1, cost: {} };
  }, complete(state, execution) {
    const change = execution.command.parameters.institution as unknown as Institution;
    for (const id of change.itemIds) ensure(state.economy?.items[id]?.ownerId === change.issuerId, 'Property owner changed');
    const result = applyInstitution(change, change.members.map(actorId => ({ actorId, termsHash: institutionHash(change), response: 'accept' })), state.institutions ?? {}); ensure(result.ok, result.reason ?? 'Invalid institution');
    state.institutions = result.rules;
    appendEvent(state, 'institution.changed', change.members, { institutionId: change.id, version: change.version, kind: change.kind, effectiveAt: change.effectiveAt, expiresAt: change.expiresAt, termsHash: institutionHash(change) }, execution.id);
  },
};
