import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import decisions from '../../../src/games/camp/village/config/social-decisions.json';
import scope from '../../../src/games/camp/village/config/social-scope.json';
import raw from '../../../src/games/camp/village/config/raw.json';

describe('S00 social scope and source boundaries', () => {
  it('does not rewrite the workbook or mix proposed social mechanics into source data', () => {
    expect(createHash('sha256').update(readFileSync('config/village/source.xlsx')).digest('hex')).toBe(raw.inputHash);
    expect(raw.inputHash).toBe('85bcb8a7baf520e6212a3c7f653884b834b7c7c4c1f8744e41765a22ad2eb0cf');
    expect(raw.tables).not.toHaveProperty('social');
    expect(scope.initialHistoryEnabled).toBe(false);
  });

  it('keeps every unconfirmed decision proposed and does not implicitly enable social actions', () => {
    expect(decisions.map(d => d.id)).toEqual(['SD01', 'SD02', 'SD03', 'SD04', 'SD05', 'SD06']);
    expect(decisions.every(d => d.status === 'proposed' && d.effectiveValues === null)).toBe(true);
    expect(scope.runtimeEnabled).toBe(false);
    expect(scope.capabilities.every(c => !c.enabled)).toBe(true);
    for (const unsupported of ['taxation', 'marriage', 'diplomacy', 'cultivation']) {
      expect(scope.excludedCapabilities).toContain(unsupported);
      expect(scope.capabilities.some(c => c.id === unsupported)).toBe(false);
    }
  });

  it('declares one authority and stages executable social behavior after its real game abilities', () => {
    expect(scope.worldWriter).toBe('world-service');
    expect(scope.executionOwner).toBe('T05');
    expect(scope.privateDataExportEnabled).toBe(false);
    expect(scope.capabilities.find(c => c.id === 'equipment-agreement')).toMatchObject({ minimumPhase: 2, owner: 'T11/S04', requires: expect.arrayContaining(['T09', 'S02']) });
    expect(scope.capabilities.find(c => c.id === 'risk-duty-rescue')).toMatchObject({ minimumPhase: 3, requires: expect.arrayContaining(['T12', 'T14']) });
    expect(new Set(scope.capabilities.map(c => c.id)).size).toBe(scope.capabilities.length);
  });
});
