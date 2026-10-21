import {validateWildlife} from '../../animals/validation';
import { canonical, ensure, record } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import type { CompiledVillageRules } from '../config/schema';
import { createActor, PERSONALITY_FIELDS } from './actors';
import { validateSocialPersistence } from '../../../../../packages/social-core/src/persistence';
import { deriveStats } from './stats';
import { validateEconomy } from './economy-validation';
import { validateCombat } from './combat-validation';
import { validateExtensions } from './extensions-validation';
import type { VillageScenario, VillageState } from './types';

export const RESOURCES = ['wood', 'stone', 'rope', 'food', 'meat'];
const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function quantities(value: unknown) {
  ensure(record(value) && Object.entries(value).every(([k, v]) => RESOURCES.includes(k) && integer(v)), 'Invalid resource quantities');
}
export function createVillageState(rules: CompiledVillageRules, scenario: VillageScenario): VillageState {
  ensure(validId(scenario.worldId) && scenario.worldId.length <= 48 && validId(scenario.id) && Number.isSafeInteger(scenario.seed), 'Invalid scenario identity');
  ensure(['fixture', 'experiment'].includes(scenario.classification), 'Explicit scenario classification required');
  ensure(scenario.actors.length <= rules.tables.globals.RECRUIT_MAX, 'Recruit limit exceeded');
  quantities(scenario.inventory);
  const playerId = 'player';
  const actors: VillageState['actors'] = { [playerId]: createActor('P001', playerId, {}, rules.tables.actors) };
  for (const spec of scenario.actors) {
    ensure(!Object.hasOwn(actors, spec.instanceId) && spec.archetypeId !== 'P001', 'Duplicate actor or player');
    actors[spec.instanceId] = createActor(spec.archetypeId, spec.instanceId, spec.initial ?? {}, rules.tables.actors);
  }
  return { worldMode: 'village-v1', schemaVersion: 1, worldId: scenario.worldId, ruleVersion: rules.ruleVersion, ruleHash: rules.ruleHash,
    seed: scenario.seed, tick: 0, elapsed: 0, nextExecution: 1, nextEvent: 1, playerId, actors, inventory: { ...scenario.inventory }, reservations: {},
    paused: true, revision: 0, executions: {}, operations: {}, events: [],
    versions: Object.fromEntries(['inventory:public', ...Object.keys(actors).map(id => `actor:${id}`)].map(id => [id, 0])),
    social: { proposals: {}, consents: [], plans: {}, agreements: {}, issues: {} } };
}

/** Dedicated schema dispatch. A legacy save never becomes a village save by casting. */
export function restoreVillageState(input: unknown, rules: CompiledVillageRules): VillageState {
  ensure(record(input) && input.worldMode === 'village-v1' && input.schemaVersion === 1, 'Unsupported village save schema');
  ensure(input.ruleVersion === rules.ruleVersion && input.ruleHash === rules.ruleHash && validId(input.worldId) && input.worldId.length <= 48, 'Pinned rules do not match save');
  ensure(integer(input.tick) && typeof input.elapsed === 'number' && input.elapsed === (input.tick as number) * .1 && input.elapsed <= 1e12, 'Invalid simulation clock');
  ensure(integer(input.revision) && integer(input.nextExecution) && (input.nextExecution as number) > 0 && integer(input.nextEvent) && (input.nextEvent as number) > 0 && Number.isSafeInteger(input.seed), 'Invalid world counters');
  ensure(typeof input.paused === 'boolean' && record(input.actors) && validId(input.playerId), 'Invalid world actors');
  const actors = input.actors;
  ensure(Object.keys(actors).length >= 1 && Object.keys(actors).length <= rules.tables.globals.RECRUIT_MAX + 1, 'Invalid population');
  let players = 0;
  for (const [id, actor] of Object.entries(actors)) {
    ensure(validId(id) && record(actor) && actor.id === id && typeof actor.name === 'string' && actor.name.length > 0 && actor.name.length <= 100, 'Invalid actor');
    const prototype = rules.tables.actors.find(p => p.id === actor.archetypeId);
    ensure(prototype && actor.kind === prototype.kind && integer(actor.level) && (actor.level as number) >= 1 && (actor.level as number) <= (input.economy ? 10 : 1) && canonical(actor.attributes) === canonical(prototype), 'Invalid archetype or unsupported growth');
    const personality = actor.personality;
    ensure(actor.personalityVersion === 1 && record(personality) && Object.keys(personality).length === 16
      && PERSONALITY_FIELDS.every(k => typeof personality[k] === 'number' && (personality[k] as number) >= 0 && (personality[k] as number) <= 1), 'Invalid personality');
    const maxHp = input.economy ? deriveStats(prototype, actor.level as number, null, rules).hp : prototype.hp;
    ensure(record(actor.body) && actor.body.maxHp === maxHp && typeof actor.body.hp === 'number' && actor.body.hp >= 0 && actor.body.hp <= maxHp, 'Invalid actor HP');
    for (const key of ['hunger', 'energy', 'morale', 'fear', 'wetness']) ensure(typeof actor.body[key] === 'number' && Number.isFinite(actor.body[key]) && (actor.body[key] as number) >= 0 && (actor.body[key] as number) <= 100, 'Invalid body state');
    ensure(typeof actor.body.downed === 'boolean' && typeof actor.body.incapacitated === 'boolean' && record(actor.position)
      && [actor.position.x, actor.position.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7), 'Invalid physical state');
    quantities(actor.carried); ensure(actor.equipment === null || input.economy && validId(actor.equipment), 'Equipment capability is not enabled in P1');
    ensure(record(actor.personal) && record(actor.personal.knowledge) && actor.personal.knowledge.actorId === id && Array.isArray(actor.personal.goals) && record(actor.personal.relations), 'Invalid personal state');
    const k = actor.personal.knowledge;
    const evidenceMap = k.evidence, entities = k.entities;
    ensure(integer(k.version) && typeof k.observedAt === 'number' && k.observedAt >= 0 && k.observedAt <= input.elapsed && record(evidenceMap) && record(entities), 'Invalid personal knowledge');
    for (const [key, known] of Object.entries(entities)) ensure(validId(key) && record(known) && known.id === key && typeof known.kind === 'string'
      && typeof known.at === 'number' && known.at >= 0 && known.at <= input.elapsed && integer(known.version) && typeof known.confidence === 'number' && known.confidence >= 0 && known.confidence <= 1
      && ['observed', 'reported'].includes(String(known.source)) && record(known.values), 'Invalid known entity');
    for (const [key, evidence] of Object.entries(evidenceMap)) ensure(validId(key) && record(evidence) && evidence.eventId === key && typeof evidence.kind === 'string'
      && typeof evidence.at === 'number' && evidence.at >= 0 && evidence.at <= input.elapsed && ['observed', 'reported'].includes(String(evidence.source)) && record(evidence.facts), 'Invalid evidence');
    for (const goal of actor.personal.goals) ensure(record(goal) && validId(goal.id) && goal.actorId === id && typeof goal.kind === 'string'
      && typeof goal.priority === 'number' && goal.priority >= 0 && goal.priority <= 1 && typeof goal.progress === 'number' && goal.progress >= 0 && goal.progress <= 1
      && integer(goal.revision) && Array.isArray(goal.basisRefs) && goal.basisRefs.every(ref => typeof ref === 'string' && Object.hasOwn(evidenceMap, ref)) && Array.isArray(goal.reconsiderOn), 'Invalid personal goal');
    for (const [target, relation] of Object.entries(actor.personal.relations)) ensure(validId(target) && record(relation) && relation.targetId === target
      && ['trust', 'affinity', 'reciprocity', 'rivalry', 'authority'].every(field => typeof relation[field] === 'number' && (relation[field] as number) >= 0 && (relation[field] as number) <= 1)
      && Array.isArray(relation.basisRefs) && relation.basisRefs.every(ref => typeof ref === 'string' && Object.hasOwn(evidenceMap, ref)), 'Invalid directed relation');
    if (prototype.kind === 'player') { players++; ensure(id === input.playerId, 'Player identity mismatch'); }
  }
  ensure(players === 1 && Object.hasOwn(actors, input.playerId), 'Exactly one player required');
  quantities(input.inventory);
  ensure(record(input.reservations) && record(input.executions) && record(input.operations) && record(input.versions) && Array.isArray(input.events), 'Invalid execution state');
  for (const [id, version] of Object.entries(input.versions)) ensure(validId(id) && integer(version), 'Invalid entity revision');
  for (const [id, execution] of Object.entries(input.executions)) {
    const sequence = Number(id.slice(`${input.worldId}:ex`.length));
    ensure(id === `${input.worldId}:ex${sequence}` && Number.isSafeInteger(sequence) && sequence > 0 && sequence < (input.nextExecution as number), 'Execution counter or identity mismatch');
    ensure(validId(id) && record(execution) && execution.id === id && record(execution.command) && validId(execution.command.operationId)
      && typeof execution.command.actorId === 'string' && Object.hasOwn(actors, execution.command.actorId) && typeof execution.command.action === 'string'
      && record(execution.command.parameters) && record(execution.command.readSet), 'Invalid execution');
    ensure(['accepted', 'running', 'completed', 'cancelled', 'failed', 'interrupted'].includes(String(execution.status))
      && typeof execution.duration === 'number' && execution.duration > 0 && execution.duration <= (input.economy ? 86400 : 60)
      && typeof execution.remaining === 'number' && execution.remaining >= 0 && execution.remaining <= execution.duration
      && typeof execution.acceptedAt === 'number' && execution.acceptedAt <= input.elapsed && Array.isArray(execution.eventIds), 'Invalid execution lifecycle');
    quantities(execution.reservation);
    if (['accepted', 'running'].includes(String(execution.status))) ensure(Object.hasOwn(input.reservations, id), 'Missing execution reservation');
    else ensure(!Object.hasOwn(input.reservations, id), 'Terminal execution has a reservation');
  }
  for (const [id, values] of Object.entries(input.reservations)) { quantities(values); ensure(Object.hasOwn(input.executions, id), 'Orphan reservation'); }
  const inventory = input.inventory as Record<string, number>;
  for (const resource of RESOURCES) ensure(Object.values(input.reservations).reduce<number>((sum, r) => sum + ((r as Record<string, number>)[resource] ?? 0), 0) <= (inventory[resource] ?? 0), 'Oversold inventory');
  for (const [id, op] of Object.entries(input.operations)) ensure(validId(id) && record(op) && typeof op.digest === 'string' && /^[a-f0-9]{64}$/.test(op.digest)
    && record(op.receipt) && op.receipt.operationId === id && typeof op.receipt.accepted === 'boolean', 'Invalid operation record');
  const seen = new Set<string>();
  for (const e of input.events) { ensure(record(e) && validId(e.id) && !seen.has(e.id) && typeof e.kind === 'string' && typeof e.at === 'number'
    && e.at >= 0 && e.at <= input.elapsed && Array.isArray(e.participants) && e.participants.every(validId) && Array.isArray(e.visibleTo) && e.visibleTo.every(validId) && record(e.facts), 'Invalid event'); seen.add(e.id); }
  for (const id of seen) { const sequence = Number(id.slice(`${input.worldId}:ev`.length));
    ensure(id === `${input.worldId}:ev${sequence}` && Number.isSafeInteger(sequence) && sequence > 0 && sequence < (input.nextEvent as number), 'Event counter or identity mismatch'); }
  validateSocialPersistence(input.social, Object.keys(actors), (actor, ref) => {
    const value = actors[actor] as unknown as VillageState['actors'][string]; return !!value && Object.hasOwn(value.personal.knowledge.evidence, ref);
  }, input.events as unknown as VillageState['events']);
  canonical(input); // rejects nonfinite nested values and non-JSON payloads
  validateEconomy(input as unknown as VillageState, rules);
  validateCombat(input as unknown as VillageState, rules);
  validateExtensions(input as unknown as VillageState);
  if(input.wildlife)validateWildlife(input.wildlife as unknown as VillageState['wildlife'] & {});
  return structuredClone(input) as unknown as VillageState;
}
