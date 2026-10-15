import type { NpcId } from '../simulation/types';
export type PersonId=NpcId|'player';
export const SOCIAL_INTENTS=['invite','accept','decline','ask','propose','defer','cancel','say','end'] as const;
export type SocialIntent=typeof SOCIAL_INTENTS[number];
export interface SocialDecision {text:string;intent:SocialIntent;locationId?:'plaza';}
export interface SocietyMessage extends SocialDecision {
 id:string;from:PersonId;to:PersonId[];replyTo?:string;at:number;source:string;version:string;
 replies:Partial<Record<PersonId,'pending'|'replied'|'unavailable'>>;depth:number;
}
export interface Appointment {
 id:string;members:PersonId[];locationId:'plaza';stage:'travelling'|'waiting'|'talking'|'completed'|'cancelled'|'expired';
 createdAt:number;dueAt:number;startedAt?:number;reason?:string;conversationStarted?:boolean;
 meetingPositions?:{id:PersonId;x:number;y:number}[];
}
export interface PlayerChoice extends SocialDecision {id:string;}
export interface PlayerChoices {id:string;messageId:string;npcId:NpcId;version:string;expiresAt:number;options:PlayerChoice[];}
export interface SocialLife {
 version:1;sequence:number;messages:SocietyMessage[];appointments:Appointment[];choices:PlayerChoices[];
 nextInitiativeAt:number;processed:string[];
 previousChoices?:{messageId:string;texts:string[];refreshedAt:number};
}
