import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = path.resolve('config/village/source.xlsx');
const temp = mkdtempSync(path.join(os.tmpdir(), 'village-import-'));
const hash = () => createHash('sha256').update(readFileSync(source)).digest('hex');
const originalHash = '85bcb8a7baf520e6212a3c7f653884b834b7c7c4c1f8744e41765a22ad2eb0cf';
afterAll(() => rmSync(temp, { recursive: true, force: true }));
function run(name: string, changes: { sheet: number; cell: string; value: string | number }[] = []) {
  let input = source;
  if (changes.length) {
    input = path.join(temp, `${name}.xlsx`);
    const result = spawnSync('python', ['tests/fixtures/village/mutate_xlsx.py', source, input, JSON.stringify(changes)], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  }
  const output = path.join(temp, name);
  const result = spawnSync('python', ['scripts/village/import_xlsx.py', input, '--output', output], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return { result, output, report: () => JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8')) };
}

describe('T01 source workbook import', () => {
  it('writes a failed compilation report for a truncated workbook', () => {
    const input = path.join(temp, 'truncated.xlsx'), output = path.join(temp, 'truncated');
    writeFileSync(input, 'PK truncated');
    const result = spawnSync('python', ['scripts/village/import_xlsx.py', input, '--output', output], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8'))).toMatchObject({ ok: false, diagnostics: [expect.objectContaining({ code: 'workbook_parse_error' })] });
  });
  it('preserves 11 sheets, raw types and all entities without treating duplicate headers as people', () => {
    const imported = run('original');
    expect(imported.result.status, imported.result.stderr).toBe(0);
    const raw = JSON.parse(readFileSync(path.join(imported.output, 'raw.json'), 'utf8'));
    expect(raw.sheets).toHaveLength(11);
    expect(imported.report().counts).toEqual({ players: 1, heroes: 7, wanderers: 3, wolves: 7, weapons: 6, fences: 10, nodes: 30, waves: 10 });
    expect(raw.sheets.find((s: { name: string }) => s.name === '武器制作').cells.D3.type).toBe('text');
    expect(raw.tables.weapons[0].attack).toBe(2);
    expect(raw.tables.weapons[4].cost).toEqual({ wood: 14, stone: 4, rope: 5 });
    expect(raw.tables.nodes.filter((n: { level: number }) => n.level === 10).map((n: { yield: number }) => n.yield)).toEqual([512, 512, 512]);
    expect(raw.sourceMap['weapons.WPN005.cost.wood']).toMatchObject({ sheet: '武器制作', cells: ['G7'], rawValue: 14, effectiveValue: 14 });
    expect(hash()).toBe(originalHash);
  });

  it('rejects illegal probabilities with a precise source cell', () => {
    const imported = run('probability', [{ sheet: 2, cell: 'J3', value: 1.1 }]);
    expect(imported.result.status).toBe(2);
    expect(imported.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'probability_out_of_range', location: '角色属性!J3' }));
  });

  it('rejects duplicate IDs and retains both locations', () => {
    const imported = run('duplicate', [{ sheet: 2, cell: 'A5', value: 'H001' }]);
    expect(imported.result.status).toBe(2);
    expect(imported.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'duplicate_id', location: '角色属性!A5', related: ['角色属性!A4'] }));
  });

  it('rejects duplicate wave identities, day zero, and unresolved wolf references', () => {
    const duplicate = run('duplicate-wave', [{ sheet: 6, cell: 'A4', value: 1 }, { sheet: 6, cell: 'B3', value: 0 }]);
    expect(duplicate.result.status).toBe(2);
    expect(duplicate.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'duplicate_id', location: '狼群波次!A4' }));
    expect(duplicate.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'number_out_of_range', location: '狼群波次!B3' }));
    const reference = run('missing-wolf', [{ sheet: 5, cell: 'A3', value: 'M999' }]);
    expect(reference.result.status).toBe(2);
    expect(reference.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown_wolf_reference', location: '狼群波次!D3' }));
  });

  it('rejects unknown recipe resource columns instead of silently relabeling them', () => {
    const imported = run('reference', [{ sheet: 7, cell: 'G2', value: '钻石需求' }]);
    expect(imported.result.status).toBe(2);
    expect(imported.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown_recipe_reference', location: '武器制作!G2' }));
  });

  it('converts numeric text strictly and never evaluates formula descriptions', () => {
    const valid = run('numeric-text', [{ sheet: 7, cell: 'G3', value: '3.0' }]);
    expect(valid.result.status, valid.result.stderr).toBe(0);
    const invalid = run('invalid-text', [{ sheet: 7, cell: 'G3', value: '3 wood' }]);
    expect(invalid.result.status).toBe(2);
    expect(invalid.report().diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_number', location: '武器制作!G3' }));
  });
});
