import { expect, it } from 'vitest';
import { reviseBelief } from '../../../packages/social-core/src/knowledge';
import type { KnowledgeSnapshot } from '../../../packages/social-core/src/types';
it('corrects a reported entity using known direct evidence without erasing the report', () => {
  const k: KnowledgeSnapshot = { actorId: 'a', observedAt: 2, version: 2, entities: { stock: { id: 'stock', kind: 'store', at: 1, version: 99, confidence: .3, source: 'reported', values: { food: 100 } } }, evidence: {
    rumor: { eventId: 'rumor', at: 1, kind: 'entity.reported', source: 'reported', facts: { entityId: 'stock', entityKind: 'store', entityVersion: 99, entityValues: { food: 100 }, confidence: .3 } },
    seen: { eventId: 'seen', at: 2, kind: 'entity.observed', source: 'observed', facts: { entityId: 'stock', entityKind: 'store', entityVersion: 2, entityValues: { food: 1 } } },
  } };
  const next = reviseBelief('a', 'seen', k); expect(next.entities.stock.values.food).toBe(1); expect(next.evidence.rumor).toEqual(k.evidence.rumor); expect(k.entities.stock.values.food).toBe(100);
  expect(() => reviseBelief('b', 'seen', k)).toThrow(); expect(() => reviseBelief('a', 'unseen', k)).toThrow();
});
