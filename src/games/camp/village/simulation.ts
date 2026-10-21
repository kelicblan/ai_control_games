import { digest, ensure } from '../../../../packages/action-runtime/src/json';
import type { ActionCommand } from '../../../../packages/action-runtime/src/types';
import type { PolicyDecision, PolicyInput } from '../../../../packages/policy-runtime/src/types';
import { selectWorldRules } from './config/load';
import { recordDecision, type DecisionGroup } from './ai/trajectory';
import type { CompiledVillageRules } from './config/schema';
import type { VillageScenario } from './domain/types';
import { createVillageState } from './domain/state';
import { buildObservation } from './ai/observation';
import { submitCommand } from './systems/commands';
import { advanceVillage } from './systems/advance';
export interface ScheduledCommand { tick: number; command: ActionCommand; decision?: PolicyDecision }
export interface ScenarioSpec { scenario: VillageScenario; ticks: number; commands: ScheduledCommand[]; ruleVersion?: string }
export interface PolicyAdapter { actorIds: string[]; decide(observation: PolicyInput): PolicyDecision }
export interface VillageRun { format: 'village-replay-v1'; classification: 'scripted-test-not-training-data'; ruleHash: string; scenario: VillageScenario;
  ticks: number; commands: ScheduledCommand[]; groups: DecisionGroup[]; finalHash: string }
export function simulateVillage(rules: CompiledVillageRules, scenario: VillageScenario, ticks: number, commands: ScheduledCommand[], policy?: PolicyAdapter): VillageRun {
  ensure(Number.isSafeInteger(ticks) && ticks >= 1 && ticks <= 100000, 'Invalid simulation horizon');
  ensure(commands.length <= 1000 && commands.every(c => Number.isSafeInteger(c.tick) && c.tick >= 0 && c.tick < ticks && (c.command.source === 'scripted_test' || c.command.source === 'mlp' && c.decision?.source === 'mlp')), 'Explicit bounded policy or scripted commands required');
  const recorded = structuredClone(commands);
  const state = createVillageState(rules, scenario); state.paused = false;
  const groups: DecisionGroup[] = [];
  const observation = (id: string) => buildObservation(state, id, state.actors[id].personal.knowledge, 'life', rules);
  for (let tick = 0; tick < ticks; tick++) {
    if (policy) for (const actorId of [...new Set(policy.actorIds)].sort()) {
      const before = observation(actorId); if (!before.candidates.length || recorded.some(c => c.tick === tick && c.command.actorId === actorId)) continue;
      const decision = policy.decide(before); if (!decision.selectedCandidateId) continue;
      const candidate = before.candidates.find(c => c.id === decision.selectedCandidateId);
      ensure(candidate && ['scripted_test', 'mlp'].includes(decision.source), 'Policy selected unsupported candidate');
      ensure(recorded.length < 1000, 'Decision budget exceeded');
      recorded.push({ tick, decision: structuredClone(decision), command: { operationId: `policy-${digest({ world: state.worldId, tick, actorId }).slice(0, 32)}`, actorId,
        action: candidate.action, parameters: candidate.parameters, readSet: candidate.readSet, source: decision.source } });
    }
    for (const scheduled of recorded.filter(c => c.tick === tick)) {
      const command = structuredClone(scheduled.command), before = observation(command.actorId), receipt = submitCommand(state, command);
      recordDecision(groups, { operationId: command.operationId, executionId: receipt.executionId ?? null, proposed: command, executed: receipt.accepted ? command : null,
        source: command.source, rawScores: scheduled.decision?.rawScores ?? {}, modelId: scheduled.decision?.modelId ?? null, modelHash: scheduled.decision?.modelHash ?? null,
        overrideReason: receipt.reason ?? null, before, after: observation(command.actorId), status: receipt.accepted ? 'accepted' : 'rejected', truncated: false });
    }
    advanceVillage(state);
    for (const group of groups) {
      if (!group.executionId || !['accepted', 'running'].includes(group.status)) continue;
      const execution = state.executions[group.executionId]; group.status = execution.status;
      group.after = observation(group.proposed.actorId);
    }
  }
  for (const group of groups) if (['accepted', 'running'].includes(group.status)) { group.truncated = true; group.status = 'truncated'; }
  return { format: 'village-replay-v1', classification: 'scripted-test-not-training-data', ruleHash: rules.ruleHash, scenario: structuredClone(scenario), ticks, commands: recorded, groups, finalHash: digest(state) };
}
export function runScenario(spec: ScenarioSpec, policy?: PolicyAdapter): VillageRun {
  return simulateVillage(selectWorldRules('village-v1', spec.ruleVersion ?? 'draft-table-v1'), spec.scenario, spec.ticks, spec.commands, policy);
}
export function replayVillage(rules: CompiledVillageRules, recorded: VillageRun): VillageRun {
  ensure(recorded.format === 'village-replay-v1' && recorded.ruleHash === rules.ruleHash, 'Replay rule mismatch');
  const result = simulateVillage(rules, recorded.scenario, recorded.ticks, recorded.commands);
  ensure(result.finalHash === recorded.finalHash && digest(result.groups) === digest(recorded.groups), 'Replay divergence'); return result;
}
