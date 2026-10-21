import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import rawJson from '../../src/games/camp/village/config/raw.json';
import decisionJson from '../../src/games/camp/village/config/decisions.json';
import selectionJson from '../../src/games/camp/village/config/draft-table-v1.json';
import fixtureJson from '../fixtures/village/draft-rules.json';
import { resolveRules, RuleCompilationError } from '../../src/games/camp/village/config/profiles';
import { decodeRawWorkbook, type DecisionRecord, type RuleSelection } from '../../src/games/camp/village/config/schema';

const raw = decodeRawWorkbook(rawJson);
const decisions = decisionJson as DecisionRecord[];
const selection = selectionJson as RuleSelection;
const compile = (chosen = selection) => resolveRules(raw, decisions, 'draft', chosen);

describe('T02 explicit rule decisions', () => {
  it('accepts a complete explicitly labeled test fixture without approving it for release', () => {
    const fixture = fixtureJson as RuleSelection;
    const rules = compile(fixture);
    expect(rules.classification).toBe('fixture');
    expect(Object.values(rules.capabilities).every(c => c.configured)).toBe(true);
    expect(() => resolveRules(raw, decisions, 'release', fixture)).toThrow();
  });
  it('rejects normalized source values that have drifted from their traced raw cells', () => {
    const changed = structuredClone(raw); changed.tables.weapons[0].cost.wood = 0;
    expect(() => resolveRules(changed, decisions, 'draft', selection)).toThrow(/source|来源/);
  });

  it('rejects empty or nonsensical structured growth supplements', () => {
    const changed = structuredClone(selection);
    changed.choices.D14.effectiveValues = { xpThresholds: [], xpSources: {}, levelHpPolicy: 'preserve-current' };
    expect(() => compile(changed)).toThrow(/xpThresholds|xpSources/);
  });

  it('rejects invalid JSON domain values even when cells and source mappings were also altered', () => {
    const changed = structuredClone(raw);
    changed.tables.actors[0].hp = -5;
    changed.tables.actors[0].hitRate = 2;
    changed.tables.waves[1].id = 1;
    expect(() => decodeRawWorkbook(changed)).toThrow();
    const missingCost = structuredClone(raw);
    delete (missingCost.tables.weapons[0] as Partial<typeof missingCost.tables.weapons[0]>).cost;
    expect(() => decodeRawWorkbook(missingCost)).toThrow();
  });

  it('rejects empty recruitment structures and unrecognized initial actors', () => {
    const changed = structuredClone(selection);
    changed.choices.D13.effectiveValues = { spawnRules: [], offerRules: [], recruitCost: [], initialRoster: ['MISSING'], heroUniqueness: [] };
    expect(() => compile(changed)).toThrow(/D13/);
  });

  it('blocks release until every required decision has explicit approval and values', () => {
    expect(() => resolveRules(raw, decisions, 'release', selection)).toThrow(/D01/);
    const approved = decisions.map(d => ({ ...d, status: 'accepted' as const }));
    expect(() => resolveRules(raw, approved, 'release', { ...selection, classification: 'approved' })).toThrow(/approval|批准/);
  });

  it('requires an explicit named experiment and never silently assumes recommended values', () => {
    expect(() => resolveRules(raw, decisions, 'draft')).toThrow(/selection|试验/);
    const chosen = structuredClone(selection); delete chosen.choices.D01;
    expect(() => compile(chosen)).toThrow(/D01/);
  });

  it('loads exactly one wave schedule and preserves the conflicting original value', () => {
    const rules = compile();
    expect(rules.waveSchedule).toEqual({ kind: 'table', days: [5, 15, 35, 55, 75, 95, 115, 135, 155, 175] });
    expect(rules.tables.globals.WAVE_INTERVAL_DAYS).toBe(2);
    expect(rules.tables.waves.map(w => w.total)).toEqual([3, 5, 7, 8, 10, 12, 14, 15, 17, 19]);
    expect(rules.decisions.every(d => d.status === 'proposed')).toBe(true);
    const alternate = structuredClone(selection);
    alternate.choices.D01 = { selectedAlternative: 'interval', effectiveValues: { everyDays: 2, firstDay: 2 } };
    expect(compile(alternate).waveSchedule).toEqual({ kind: 'interval', everyDays: 2, firstDay: 2 });
    expect(compile(alternate).ruleHash).not.toBe(rules.ruleHash);
  });

  it('keeps node and per-action yields mutually exclusive and leaves recipes unchanged', () => {
    const rules = compile();
    expect(rules.gatherMode).toBe('node_depletion');
    expect(rules.tables.weapons).toEqual(raw.tables.weapons);
    expect(rules.tables.weapons[2]).toMatchObject({ note: '不需要箭矢', cost: { wood: 10, stone: 0, rope: 3 } });
    const invalid = structuredClone(selection);
    invalid.choices.D03.effectiveValues = { nodeYield: true, perActionYield: true };
    expect(() => compile(invalid)).toThrow(/D03/);
  });

  it('does not enable work or progression whose required supplements are absent', () => {
    const rules = compile();
    expect(rules.capabilities.repairFence).toEqual({ configured: false, missing: ['repairHpPerJob', 'repairWorkSeconds'] });
    expect(rules.capabilities.progression.missing).toContain('xpThresholds');
    expect(rules.capabilities.recruit.missing).toContain('initialRoster');
    expect(rules.classification).toBe('experiment');
  });

  it('makes fixture parameters explicit, finite and part of the rule hash', () => {
    const chosen = structuredClone(selection); chosen.classification = 'fixture';
    chosen.choices.D10.effectiveValues = { repairHpPerJob: 50, repairWorkSeconds: 5 };
    expect(compile(chosen).capabilities.repairFence.configured).toBe(true);
    expect(compile(chosen).ruleHash).not.toBe(compile().ruleHash);
    chosen.choices.D10.effectiveValues = { repairHpPerJob: -1, repairWorkSeconds: 5 };
    expect(() => compile(chosen)).toThrow(/repairHpPerJob/);
  });

  it('does not bless a fixture by changing its classification to approved', () => {
    const chosen = structuredClone(selection); chosen.classification = 'approved';
    expect(() => resolveRules(raw, decisions, 'release', chosen)).toThrow(RuleCompilationError);
  });

  it('produces stable immutable rules and preserves raw values and workbook bytes', () => {
    const before = JSON.stringify(raw);
    const rules = compile();
    expect(rules.ruleHash).toMatch(/^[a-f0-9]{64}$/);
    const reordered = Object.fromEntries(Object.entries(selection.choices).reverse());
    expect(compile({ ...selection, choices: reordered }).ruleHash).toBe(rules.ruleHash);
    expect(Object.isFrozen(rules.tables.weapons[0].cost)).toBe(true);
    expect(() => { rules.tables.weapons[0].cost.wood = 0; }).toThrow();
    expect(JSON.stringify(raw)).toBe(before);
    expect(createHash('sha256').update(readFileSync('config/village/source.xlsx')).digest('hex')).toBe(raw.inputHash);
  });
});
