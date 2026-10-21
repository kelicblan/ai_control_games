import type { ActorId, Json, ReadSet } from '../../action-runtime/src/types';
export interface KnownEntity { id: string; kind: string; at: number; version: number; confidence: number; source: 'observed' | 'reported'; values: Record<string, Json> }
export interface Evidence { eventId: string; at: number; kind: string; source: 'observed' | 'reported'; facts: Record<string, Json> }
export interface KnowledgeSnapshot { actorId: ActorId; observedAt: number; version: number; entities: Record<string, KnownEntity>; evidence: Record<string, Evidence> }
export interface PersonalGoal { id: string; actorId: ActorId; kind: string; priority: number; progress: number; basisRefs: string[]; revision: number; reconsiderOn: string[] }
export interface Relation { targetId: ActorId; trust: number; affinity: number; reciprocity: number; rivalry: number; authority: number; basisRefs: string[] }
export interface PersonalState { knowledge: KnowledgeSnapshot; goals: PersonalGoal[]; relations: Record<string, Relation> }
export interface ConsentRecord { actorId: ActorId; proposalId: string; proposalVersion: number; termsHash: string; response: 'accept' | 'decline'; operationId: string }
export interface PlanStep { capability: string; version: string; actorId: ActorId; targetId?: string; parameters: Record<string, Json> }
export interface SocialProposal {
  schemaVersion: 1; id: string; actorId: ActorId; issueId: string; version: number; basisRefs: string[];
  parties: ActorId[]; terms: { steps: PlanStep[]; deadline: number | null }; readSet: ReadSet; speech: string;
}
export interface SocialIssue { id: string; participants: ActorId[]; status: 'open' | 'negotiating' | 'waiting' | 'agreed' | 'rejected' | 'closed'; revision: number; basisRefs: string[]; reasonKey?: string; attempts?: number; retryAfter?: number; leaseUntil?: number; waitingForPlayer?: boolean }
export interface Agreement { id: string; proposalId: string; termsHash: string; parties: ActorId[]; status: 'proposed' | 'accepted' | 'waiting_conditions' | 'executing' | 'verifying' | 'fulfilled' | 'cancelled' | 'partial' | 'breached'; evidenceRefs: string[];
  conditionHash?: string;
  reason?: string;
  obligations?: { kind: 'equipment' | 'rest' | 'task'; actorId: string; recipientId?: string; itemId?: string; minimumSeconds?: number; operationId?: string; action?: string }[] }
export interface SocialPlan { id: string; proposalId: string; steps: PlanStep[]; agreementIds: string[]; status: 'pending' | 'active' | 'completed' | 'cancelled'; readSet: ReadSet }
