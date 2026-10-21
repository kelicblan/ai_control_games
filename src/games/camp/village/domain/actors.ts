import raw from '../config/raw.json';
import { decodeRawWorkbook, type ActorPrototype } from '../config/schema';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import contract from '../ai/contract.json';
import type { ActorInitial, ActorInstance } from './types';

const prototypes = decodeRawWorkbook(raw).tables.actors;
export const PERSONALITY_FIELDS = contract.stateGroups.personality.map(f => f.id);
export function createActor(archetypeId: string, instanceId: string, initial: ActorInitial, catalog: ActorPrototype[] = prototypes): ActorInstance {
  ensure(validId(instanceId), 'Invalid actor identity');
  const prototype = catalog.find(p => p.id === archetypeId);
  ensure(prototype, 'Unknown actor archetype');
  const position = initial.position ?? { x: 0, y: 0 };
  ensure([position.x, position.y].every(v => Number.isFinite(v) && Math.abs(v) <= 1e7), 'Invalid actor position');
  const personality: Record<string, number> = Object.fromEntries(PERSONALITY_FIELDS.map(k => [k, .5]));
  for (const [key, value] of Object.entries(initial.personality ?? {})) {
    ensure(PERSONALITY_FIELDS.includes(key) && Number.isFinite(value) && value >= 0 && value <= 1, 'Invalid personality trait'); personality[key] = value;
  }
  const name = initial.name ?? prototype.name;
  ensure(typeof name === 'string' && name.trim().length > 0 && name.length <= 100, 'Invalid actor name');
  return { id: instanceId, archetypeId, personalityVersion: 1, name, kind: prototype.kind, level: 1, attributes: structuredClone(prototype),
    body: { hp: prototype.hp, maxHp: prototype.hp, hunger: 0, energy: 100, morale: 100, fear: 0, wetness: 0, downed: false, incapacitated: false },
    position: { ...position }, personality, carried: {}, equipment: null,
    personal: { knowledge: { actorId: instanceId, observedAt: 0, version: 0, entities: {}, evidence: {} }, goals: [], relations: {} } };
}
