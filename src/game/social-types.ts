import type { ActionId, NpcId } from './types';

export const SOCIAL_KINDS = ['work', 'rest', 'food', 'weather', 'fairness', 'help', 'explore', 'promise', 'checkin'] as const;
export type SocialKind = typeof SOCIAL_KINDS[number];
export type SocialTopic = 'checkin' | 'work' | 'food' | 'weather' | 'conflict' | 'promise';
export type SocialLineSource = 'template' | 'minimind3' | 'cache' | 'player';
export interface SocialLine {
  id: number; speaker: NpcId | 'player'; text: string; at: number; source: SocialLineSource;
}
export interface SocialThread {
  id: number; kind: SocialKind; initiator: NpcId; participants: NpcId[];
  title: string; prompt: string; createdAt: number; expiresAt: number;
  status: 'open' | 'resolved' | 'expired'; revision: number;
  lines: SocialLine[]; choiceId: string | null; resolution: string;
}
export interface SocialChoice {
  id: string; label: string; description: string; disabledReason?: string;
}
export interface SocialMemory {
  id: number; npcId: NpcId; otherId?: NpcId; threadId: number; at: number;
  kind: 'agreement' | 'promise_kept' | 'promise_broken' | 'help' | 'choice' | 'ignored'; text: string;
}
export interface SocialPromise {
  id: number; npcId: NpcId; threadId: number; kind: 'meal' | 'rest';
  createdAt: number; dueAt: number; status: 'pending' | 'kept' | 'broken' | 'cancelled'; fulfilledAt: number | null;
}
export interface SocialAgreement {
  id: number; npcId: NpcId; threadId: number; action: ActionId; targetId?: NpcId;
  createdAt: number; until: number;
}
export interface SocialRelationship { from: NpcId; to: NpcId; affinity: number }
export interface SocialPersonState { workload: number; resentment: number; cooldownUntil: number }
export interface SocialState {
  version: 1; revision: number; nextId: number; nextLineId: number;
  nextCheckAt: number; nextPromptAt: number; introduced: boolean;
  people: Record<NpcId, SocialPersonState>;
  threads: SocialThread[]; memories: SocialMemory[]; promises: SocialPromise[];
  agreements: SocialAgreement[]; relationships: SocialRelationship[];
  stats: { initiated: number; replied: number; resolved: number; ignored: number; kept: number; broken: number };
}
