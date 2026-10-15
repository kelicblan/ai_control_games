import type { Experience, MemoryState } from '../../../../packages/npc-core/src';
import type { BehaviorIntent } from '../../../../packages/npc-core/src';
import type { NpcId, Point } from '../simulation/types';
export interface Appraisal {
  version: 1; summary: string; evidenceIds: string[]; goal: string;
  emotionAssessment: { anger: number; resentment: number; stress: number };
  preferences: Partial<Record<BehaviorIntent, number>>;
  expression: { text: string; targetId: string | null };
}
export interface Collective {
  id: number; concern: 'rest' | 'food' | 'fairness' | 'safety'; initiator: NpcId;
  members: NpcId[]; invited: NpcId[]; declined: NpcId[];
  stage: 'forming' | 'recruiting' | 'negotiating' | 'striking' | 'easing' | 'ended';
  createdAt: number; updatedAt: number; round: number;
  threadId?: number;
  promise?: { kind: 'rest' | 'food' | 'fairness'; dueAt: number; startedAt: number; fulfilled: NpcId[]; workloads: Partial<Record<NpcId,number>> };
}
export interface AgencyPerson {
  memory: MemoryState; lastSpeech: string; lastTasks: number; lastAction: string | null;
  body: number[]; knownWork: Partial<Record<NpcId, { workload: number; at: number }>>;
  appraisal: Appraisal | null; appraisalAt: number; appraisalThrough: number;
  assessedThrough: number; nextAppraisalAt: number; appraisalStatus: 'idle' | 'pending' | 'ready' | 'fallback';
  decision: { source: 'utility-v1'; candidates: { intent: BehaviorIntent; probability: number }[]; selected: BehaviorIntent; randomBefore: number; randomAfter: number; at: number } | null;
  invitation: { groupId: number; targetId: NpcId; since: number; origin: Point } | null;
  nextInviteAt: number;
}
export interface AgencyState {
  modelBinding?:'dialogue';
  legacyImported?: boolean;
  version: 1; enabled: boolean; cognition: boolean; modelId: string | null; settingsRevision: number;
  sequence: number; pending: Experience[]; people: Partial<Record<NpcId, AgencyPerson>>;
  groups: Collective[]; nextGroupId: number;
}
