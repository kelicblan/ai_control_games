import type { Point } from './types';
export interface ResourceNode { id: string; resource: 'wood' | 'stone' | 'rope'; level: number; maxHp: number; remainingHp: number; yield: number; position: Point; depletedEventId: string | null }
export interface ResourceContainer { id: string; position: Point; resources: Record<string, number>; sourceEventId: string }
export interface EquipmentItem { id: string; recipeId: string; ownerId: string; holderId: string; equippedBy: string | null; orderId: string }
export interface WorkOrder { id: string; executionId: string; actorId: string; kind: 'craft' | 'upgradeFence'; recipeId: string; recipientId: string; agreementId: string | null; status: 'working' | 'completed' | 'cancelled'; itemId: string | null; deliveryRequested?: boolean; deliveryOperationId?: string }
export interface RecruitOffer { id: string; archetypeId: string; expiresAt: number; acceptedBy: string | null }
export interface EconomyState { version: 1; nodes: Record<string, ResourceNode>; containers: Record<string, ResourceContainer>; items: Record<string, EquipmentItem>; forestExpansion?:string;
  workshop?: { version: 1; position: Point; buildExecutionId: string | null; completedEventId: string | null; legacyExecutions: string[] };
  journey?: { version: 1; lastEvent: number; completed: Record<string, { eventId: string; at: number }>; hunts: Record<string, string> };
  foodSources?: Record<string, { id: string; position: Point; remaining: number; capacity: number; refilledInterval: number }>;
  orders: Record<string, WorkOrder>; offers: Record<string, RecruitOffer>; experience: Record<string, number>; xpEvents: Record<string, string>;
  transfers: Record<string, { digest: string; accepted: boolean; reason?: string }>; foodDays: Record<string, boolean>; storePosition: Point; fence: { level: number; hp: number }; }
