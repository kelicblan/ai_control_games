import { assertFiniteJson, copyFiniteJson, digest, ensure, record } from './json';
import { validId, type ActionCommand, type CommandReceipt, type DomainEvent, type Execution, type ExecutionState } from './types';
export interface ActionCapability<S> {
  advance?(state: S, execution: Execution, dt: number): void;
  id: string; validate(state: S, command: ActionCommand): { duration: number; cost: Record<string, number> };
  complete(state: S, execution: Execution): void;
}
export interface ActionHost<S extends ExecutionState> {
  validate?(state: S): void;
  available(state: S, actorId: string): boolean;
  reserve(state: S, executionId: string, cost: Record<string, number>): void;
  settle(state: S, executionId: string, consume: boolean): void;
}
export const terminal = (e: Execution) => !['accepted', 'running'].includes(e.status);
export function appendEvent<S extends ExecutionState>(state: S, kind: string, actors: string[], facts: DomainEvent['facts'], executionId?: string): DomainEvent {
  ensure(Number.isSafeInteger(state.nextEvent) && state.nextEvent > 0 && !state.events.some(e => e.id === `${state.worldId}:ev${state.nextEvent}`), 'Event ID collision');
  const event: DomainEvent = { id: `${state.worldId}:ev${state.nextEvent++}`, at: state.elapsed, kind, participants: [...actors], visibleTo: [...actors], facts,
    ...(executionId ? { executionId } : {}) };
  state.events.push(event); return event;
}
export function createActionRuntime<S extends ExecutionState>(host: ActionHost<S>, capabilities: readonly ActionCapability<S>[]) {
  ensure(new Set(capabilities.map(c => c.id)).size === capabilities.length, 'Duplicate action capability');
  const registry = new Map(capabilities.map(c => [c.id, c]));
  const commit = (state: S, next: S) => Object.assign(state, next);
  const oldOperation = (state: S, id: string, hash: string) => {
    const old = state.operations[id]; if (!old) return undefined;
    ensure(old.digest === hash, 'Operation ID reused with different terms'); return structuredClone(old.receipt);
  };
  const remember = (state: S, hash: string, receipt: CommandReceipt, command?: ActionCommand) => { state.operations[receipt.operationId] = { digest: hash, receipt: structuredClone(receipt), ...(command?.issuedAtTick === undefined ? {} : { issuedAtTick: command.issuedAtTick }) }; return receipt; };
  function submit(state: S, command: ActionCommand): CommandReceipt {
    ensure(validId(command.operationId) && validId(command.actorId) && validId(command.action) && record(command.parameters) && record(command.readSet), 'Invalid action command');
    ensure(['mlp', 'active_plan', 'physical_constraint', 'player_input', 'fallback', 'scripted_test'].includes(command.source), 'Invalid decision source');
    ensure(Object.entries(command.readSet).every(([id, n]) => validId(id) && Number.isSafeInteger(n) && n >= 0), 'Invalid read set');
    ensure(command.issuedAtTick === undefined || Number.isSafeInteger(command.issuedAtTick) && command.issuedAtTick >= 0, 'Invalid command timestamp');
    const hash = digest(command), old = oldOperation(state, command.operationId, hash); if (old) return old;
    const next = copyFiniteJson(state);
    let receipt: CommandReceipt;
    try {
      const capability = registry.get(command.action); ensure(capability, 'Action capability unavailable');
      ensure(host.available(next, command.actorId), 'Actor cannot act');
      ensure(!Object.values(next.executions).some(e => e.command.actorId === command.actorId && !terminal(e)), 'Actor already executing');
      for (const [id, version] of Object.entries(command.readSet)) ensure(next.versions[id] === version, `Related entity changed: ${id}`);
      const { duration, cost } = capability.validate(next, command);
      ensure(Number.isFinite(duration) && duration >= .1 && duration <= 86400 && record(cost) && Object.entries(cost).every(([id, n]) => validId(id) && Number.isSafeInteger(n) && n >= 0), 'Invalid capability work or cost');
      const id = `${next.worldId}:ex${next.nextExecution++}`;
      ensure(validId(id) && !Object.hasOwn(next.executions, id), 'Execution ID collision');
      host.reserve(next, id, cost);
      const event = appendEvent(next, 'execution.accepted', [command.actorId], { action: command.action }, id);
      next.executions[id] = { id, command: structuredClone(command), acceptedAt: next.elapsed, duration, remaining: duration, status: 'accepted', reservation: { ...cost }, eventIds: [event.id] };
      next.versions[`actor:${command.actorId}`] = (next.versions[`actor:${command.actorId}`] ?? 0) + 1;
      receipt = { accepted: true, operationId: command.operationId, executionId: id };
      remember(next, hash, receipt, command); host.validate?.(next); commit(state, next);
    } catch (error) {
      // Discard every capability/ledger mutation, then persist only the rejection.
      receipt = { accepted: false, operationId: command.operationId, reason: error instanceof Error ? error.message : 'Action rejected' };
      remember(state, hash, receipt, command);
    }
    return structuredClone(receipt);
  }
  function cancel(state: S, executionId: string, actorId: string, operationId: string): CommandReceipt {
    ensure(validId(operationId) && validId(actorId) && validId(executionId), 'Invalid cancellation');
    const hash = digest({ executionId, actorId, cancel: true }), old = oldOperation(state, operationId, hash); if (old) return old;
    const next = copyFiniteJson(state), execution = next.executions[executionId];
    const receipt: CommandReceipt = { accepted: !!execution && !terminal(execution) && execution.command.actorId === actorId, operationId, executionId };
    if (receipt.accepted) {
      host.settle(next, executionId, false); execution.status = 'cancelled'; execution.reason = 'Cancelled by actor';
      execution.eventIds.push(appendEvent(next, 'execution.cancelled', [actorId], {}, executionId).id);
      next.versions[`actor:${actorId}`]++;
    } else receipt.reason = 'Cancellation is not owned or task is terminal';
    remember(next, hash, receipt); commit(state, next); return structuredClone(receipt);
  }
  function advance(state: S, dt: number): DomainEvent[] {
    ensure(Number.isFinite(dt) && dt > 0 && dt <= .25, 'Invalid execution step');
    const firstEvent = state.events.length;
    for (const id of Object.keys(state.executions).sort()) {
      const current = state.executions[id]; if (terminal(current)) continue;
      const next = copyFiniteJson(state), execution = next.executions[id];
      try {
        ensure(host.available(next, execution.command.actorId), 'Actor became incapacitated');
        const capability = registry.get(execution.command.action); ensure(capability, 'Capability disappeared');
        execution.status = 'running'; capability.advance?.(next, execution, Math.min(dt, execution.remaining)); execution.remaining = Math.max(0, Math.round((execution.remaining - dt) * 1e9) / 1e9);
        if (execution.remaining === 0) {
          host.settle(next, id, true); capability.complete(next, execution); execution.status = 'completed';
          execution.eventIds.push(appendEvent(next, 'execution.completed', [execution.command.actorId], { action: execution.command.action, ...(execution.command.planId ? { planId: execution.command.planId, operationId: execution.command.operationId } : {}) }, id).id);
          next.versions[`actor:${execution.command.actorId}`]++;
        }
        assertFiniteJson(next); host.validate?.(next); commit(state, next);
      } catch (error) {
        const failed = copyFiniteJson(state), task = failed.executions[id];
        host.settle(failed, id, false); task.status = host.available(failed, task.command.actorId) ? 'failed' : 'interrupted';
        task.reason = error instanceof Error ? error.message : 'Execution failed';
        task.eventIds.push(appendEvent(failed, `execution.${task.status}`, [task.command.actorId], { reason: task.reason }, id).id);
        failed.versions[`actor:${task.command.actorId}`]++; commit(state, failed);
      }
    }
    return state.events.slice(firstEvent);
  }
  return { submit, cancel, advance, capabilityIds: [...registry.keys()] };
}
