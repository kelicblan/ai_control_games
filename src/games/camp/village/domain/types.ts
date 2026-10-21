import type { ActorId, ExecutionState } from '../../../../../packages/action-runtime/src/types';
import type { PersonalState, SocialProposal, ConsentRecord, SocialPlan, Agreement, SocialIssue } from '../../../../../packages/social-core/src/types';
import type { ActorPrototype } from '../config/schema';
import type { EconomyState } from './economy';
export type { ActorId, DomainEvent, ActionCommand, CommandReceipt, ReadSet } from '../../../../../packages/action-runtime/src/types';
export interface Point { x: number; y: number }
export interface ActorInitial { name?: string; position?: Point; personality?: Record<string, number> }
export interface ActorInstance {
  id: ActorId; archetypeId: string; personalityVersion: 1; name: string; kind: ActorPrototype['kind']; level: number;
  attributes: ActorPrototype; body: { hp: number; maxHp: number; hunger: number; energy: number; morale: number; fear: number; wetness: number; downed: boolean; incapacitated: boolean };
  position: Point; personality: Record<string, number>; carried: Record<string, number>; equipment: string | null; personal: PersonalState;
}
export interface VillageScenario {
  navigationMode?: 'shared-world';
  ruleVersion?: string;
  useEcologyNodes?: boolean;
  resourceNodes?: { id: string; resource: 'wood' | 'stone' | 'rope'; level: number; position: Point }[];
  storePosition?: Point;
  id: string; classification: 'fixture' | 'experiment'; worldId: string; seed: number;
  actors: { archetypeId: string; instanceId: string; initial?: ActorInitial }[];
  inventory: Record<string, number>;
}
export interface VillageState extends ExecutionState {
  wildlife?: import('../../animals/authority').WildlifeAuthority;
  catchupTicks?: number;
  history?: { sequence: number; retiredBeforeTick: number; archivedEvents: number; archivedExecutions: number; chainHash: string; segments: {sequence:number;hash:string;count:number;chainHash:string}[] };
  policyMemo?: Record<string,{ fingerprint:string; nextAt:number }>;
  navigation?: { mode: 'shared-world'; routes: Record<string, { target: Point; points: Point[]; revision: number; steering?: {side:1|-1;until:number;blocked:number} }> };
  combat?: import('./combat').CombatState;
  institutions?: Record<string, import('../../../../../packages/social-core/src/institutions').Institution>;
  economy?: EconomyState;
  worldMode: 'village-v1'; schemaVersion: 1; ruleVersion: string; ruleHash: string; seed: number; tick: number;
  playerId: ActorId; actors: Record<ActorId, ActorInstance>; inventory: Record<string, number>; reservations: Record<string, Record<string, number>>;
  paused: boolean; revision: number; social: { proposals: Record<string, SocialProposal>; consents: ConsentRecord[]; plans: Record<string, SocialPlan>; agreements: Record<string, Agreement>; issues: Record<string, SocialIssue> };
}
