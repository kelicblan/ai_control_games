export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type ActorId = string;
export type ReadSet = Record<string, number>;
export type DecisionSource = 'mlp' | 'active_plan' | 'physical_constraint' | 'player_input' | 'fallback' | 'scripted_test';
export interface DomainEvent {
  id: string; at: number; kind: string; participants: ActorId[]; visibleTo: ActorId[];
  executionId?: string; causationId?: string; facts: JsonObject;
}
export interface ActionCommand {
  operationId: string; actorId: ActorId; action: string; targetId?: string; parameters: JsonObject;
  readSet: ReadSet; source: DecisionSource; planId?: string; issuedAtTick?: number;
}
export type ExecutionStatus = 'accepted' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
export interface Execution {
  id: string; command: ActionCommand; acceptedAt: number; duration: number; remaining: number;
  status: ExecutionStatus; reservation: Record<string, number>; eventIds: string[]; reason?: string;
}
export interface CommandReceipt { accepted: boolean; operationId: string; executionId?: string; reason?: string }
export interface OperationRecord { digest: string; receipt: CommandReceipt; issuedAtTick?: number }
export interface ExecutionState {
  worldId: string; elapsed: number; nextExecution: number; nextEvent: number;
  executions: Record<string, Execution>; operations: Record<string, OperationRecord>; events: DomainEvent[]; versions: ReadSet;
}
export function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,95}$/.test(id) && !['constructor', 'prototype', '__proto__'].includes(id);
}
