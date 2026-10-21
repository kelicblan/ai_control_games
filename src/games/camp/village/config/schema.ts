export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface SourceRef {
  sheet: string; cells: string[]; rawValue: JsonValue; effectiveValue: JsonValue; classification: 'source';
}
export interface Diagnostic { code: string; location: string; message: string; severity: 'error' | 'warning'; related?: string[] }
export interface RawCell { type: string; value: JsonValue; rawText: string | null; xmlType: string; formula?: string }
export interface ResourceCost { wood: number; stone: number; rope?: number }
export interface ActorPrototype {
  id: string; name: string; kind: 'player' | 'hero' | 'wanderer'; acquisition: string; hp: number; attack: number;
  defense: number; attackSpeed: number; range: number; hitRate: number; critRate: number; critMultiplier: number;
  gather: number; explore: number; craft: number; moveSpeed: number; note: string;
}
export interface WeaponRule { id: string; name: string; kind: string; note: string; attack: number; attackSpeedModifier: number; range: number; workSeconds: number; cost: ResourceCost }
export interface FenceRule { level: number; hp: number; defense: number; cost: ResourceCost; repairCost: ResourceCost }
export interface WolfRule { id: string; name: string; hp: number; attack: number; defense: number; attackSpeed: number; hitRate: number; critRate: number; critMultiplier: number; moveSpeed: number; targetPreference: string; drops: { wood: number; stone: number; meat: number } }
export interface WaveRule { id: number; day: number; threat: number; counts: Record<string, number>; total: number }
export interface ResourceNodeRule { id: string; resource: 'wood' | 'stone' | 'rope'; level: number; hp: number; yield: number }
export interface RawWorkbook {
  schemaVersion: 1; inputHash: string; sheets: { name: string; dimension: string | null; cells: Record<string, RawCell> }[];
  sourceMap: Record<string, SourceRef>; diagnostics: Diagnostic[];
  tables: { globals: Record<string, number>; actors: ActorPrototype[]; wolves: WolfRule[]; weapons: WeaponRule[]; fences: FenceRule[]; waves: WaveRule[]; nodes: ResourceNodeRule[] };
}

/** JSON 导入边界：不以 TypeScript 强转替代文件结构和数值校验。 */
export function decodeRawWorkbook(input: unknown): RawWorkbook {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(`Invalid workbook: ${message}`); }
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  assert(record(input) && input.schemaVersion === 1 && typeof input.inputHash === 'string' && /^[a-f0-9]{64}$/.test(input.inputHash), 'header');
  assert(Array.isArray(input.sheets) && input.sheets.length === 11 && input.sheets.every(s => record(s) && typeof s.name === 'string' && record(s.cells)), 'sheets');
  assert(Array.isArray(input.diagnostics) && input.diagnostics.every(d => record(d) && typeof d.code === 'string' && typeof d.location === 'string' && ['error', 'warning'].includes(String(d.severity))), 'diagnostics');
  assert(record(input.sourceMap) && record(input.tables), 'tables and sourceMap');
  const tables = input.tables;
  assert(record(tables.globals) && Object.values(tables.globals).every(finite), 'globals');
  for (const key of ['BASE_DEF_REDUCTION_CAP', 'HIT_RATE', 'CRIT_RATE_BASE', 'EXPLORE_RISK_BASE']) assert(typeof tables.globals[key] === 'number' && tables.globals[key] >= 0 && tables.globals[key] <= 1, `globals.${key}`);
  const fields: Record<string, string[]> = {
    actors: ['hp', 'attack', 'defense', 'attackSpeed', 'range', 'hitRate', 'critRate', 'critMultiplier', 'gather', 'explore', 'craft', 'moveSpeed'],
    wolves: ['hp', 'attack', 'defense', 'attackSpeed', 'hitRate', 'critRate', 'critMultiplier', 'moveSpeed'],
    weapons: ['attack', 'attackSpeedModifier', 'range', 'workSeconds'], fences: ['level', 'hp', 'defense'],
    waves: ['id', 'day', 'threat', 'total'], nodes: ['level', 'hp', 'yield'],
  };
  for (const [name, keys] of Object.entries(fields)) {
    const rows = tables[name];
    assert(Array.isArray(rows) && rows.length > 0, name);
    const seen = new Set<string | number>();
    for (const row of rows) {
      assert(record(row) && keys.every(k => finite(row[k])), `${name} numbers`);
      if (!['fences', 'waves'].includes(name)) assert(typeof row.id === 'string', `${name} ID`);
      const id = name === 'fences' ? row.level : row.id;
      assert((typeof id === 'string' || typeof id === 'number') && !seen.has(id), `${name} unique identity`);
      seen.add(id);
      for (const key of keys) {
        const value = row[key] as number;
        if (['hitRate', 'critRate'].includes(key)) assert(value >= 0 && value <= 1, `${name}.${key} probability`);
        else if (key === 'critMultiplier') assert(value >= 1, `${name}.${key}`);
        else if (['hp', 'attackSpeed', 'range', 'moveSpeed', 'workSeconds', 'day', 'level', 'threat', 'yield'].includes(key)) assert(value > 0, `${name}.${key} positive`);
        else if (key !== 'attackSpeedModifier') assert(value >= 0, `${name}.${key} nonnegative`);
        if (['level', 'day', 'total', 'yield'].includes(key)) assert(Number.isSafeInteger(value), `${name}.${key} integer`);
      }
      if (['actors', 'wolves'].includes(name)) assert(typeof row.name === 'string' && row.name.length > 0, `${name}.name`);
      if (name === 'actors') assert(['player', 'hero', 'wanderer'].includes(String(row.kind)), 'actor kind');
      if (name === 'nodes') assert(['wood', 'stone', 'rope'].includes(String(row.resource)) && (row.level as number) <= 10 && row.id === `${row.resource}_${row.level}`, 'node identity');
      for (const child of name === 'weapons' ? ['cost'] : name === 'fences' ? ['cost', 'repairCost'] : name === 'waves' ? ['counts'] : name === 'wolves' ? ['drops'] : []) {
        assert(record(row[child]), `${name}.${child} required`);
      }
      for (const child of ['cost', 'repairCost', 'drops', 'counts']) if (child in row) assert(record(row[child]) && Object.values(row[child]).every(v => finite(v) && (v as number) >= 0), `${name}.${child}`);
      for (const child of ['cost', 'repairCost', 'drops']) if (child in row) {
        const values = row[child] as Record<string, unknown>;
        const expected = child === 'drops' ? ['wood', 'stone', 'meat'] : name === 'weapons' ? ['wood', 'stone', 'rope'] : ['wood', 'stone'];
        assert(Object.keys(values).length === expected.length && expected.every(k => Number.isSafeInteger(values[k]) && (values[k] as number) >= 0), `${name}.${child} resource references`);
      }
    }
  }
  for (const [name, count] of Object.entries({ actors: 11, wolves: 7, weapons: 6, fences: 10, waves: 10, nodes: 30 })) assert((tables[name] as unknown[]).length === count, `${name} count`);
  const wolves = new Set((tables.wolves as Record<string, unknown>[]).map(w => w.id));
  let previousDay = 0;
  for (const [index, wave] of (tables.waves as Record<string, unknown>[]).entries()) {
    assert(wave.id === index + 1 && (wave.day as number) > previousDay, 'wave identity and day order'); previousDay = wave.day as number;
    const counts = wave.counts as Record<string, unknown>;
    assert(Object.keys(counts).length === 7 && Object.entries(counts).every(([id, n]) => wolves.has(id) && Number.isSafeInteger(n) && (n as number) >= 0), 'wave wolf references');
    assert(Object.values(counts).reduce<number>((sum, n) => sum + (n as number), 0) === wave.total, 'wave count total');
  }
  // 归一化值必须仍与原单元格和来源映射一致，不能在 JSON 中偷偷覆写配方。
  for (const [key, ref] of Object.entries(input.sourceMap)) {
    assert(record(ref) && typeof ref.sheet === 'string' && Array.isArray(ref.cells) && ref.cells.length === 1, `source ${key}`);
    const sheet = input.sheets.find(s => record(s) && s.name === ref.sheet) as Record<string, unknown> | undefined;
    const cells = sheet?.cells as Record<string, unknown> | undefined;
    const source = cells?.[String(ref.cells[0])];
    assert(record(source) && JSON.stringify(source.value) === JSON.stringify(ref.rawValue), `source cell ${key}`);
    const parts = key.split('.');
    let projected: unknown = tables[parts.shift()!];
    const identity = parts.shift()!;
    if (Array.isArray(projected)) projected = projected.find(r => record(r) && String(r.id ?? r.level) === identity);
    else projected = record(projected) ? projected[identity] : undefined;
    for (const part of parts) projected = record(projected) ? projected[part] : undefined;
    assert(JSON.stringify(projected) === JSON.stringify(ref.effectiveValue), `source projection ${key}`);
    if (typeof projected === 'number') {
      assert(typeof ref.rawValue === 'number' || typeof ref.rawValue === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(ref.rawValue.trim()), `source number ${key}`);
      assert(Number(ref.rawValue) === projected, `source conversion ${key}`);
    } else assert(ref.rawValue === projected, `source text ${key}`);
  }
  return input as unknown as RawWorkbook;
}
export interface CompilationReport { schemaVersion: number; inputHash: string; sourceFile: string; ok: boolean; diagnostics: Diagnostic[]; counts: Record<string, number> }
export interface DecisionRecord {
  id: string; topic: string; source: string; raw: string; proposal: string; configKey: string; acceptance: string;
  status: 'proposed' | 'accepted' | 'rejected'; selectedAlternative?: string; effectiveValues?: JsonValue;
  decidedBy?: string; decidedAt?: string; rationale?: string;
}
export interface RuleSelection {
  id: string; classification: 'experiment' | 'fixture' | 'approved';
  choices: Record<string, { selectedAlternative: string; effectiveValues: JsonValue }>;
}
export interface ClockRules { daylightSeconds: number; nightSeconds: number }
export type VillageCapability = 'gather' | 'craft' | 'upgradeFence' | 'repairFence' | 'recruit' | 'progression' | 'explore' | 'recovery' | 'combat';
export interface CompiledVillageRules {
  schemaVersion: 1; worldMode: 'village-v1'; ruleVersion: string; ruleHash: string; sourceWorkbookHash: string;
  mode: 'draft' | 'release'; classification: RuleSelection['classification']; clock: ClockRules;
  tables: RawWorkbook['tables']; sourceMap: RawWorkbook['sourceMap']; decisions: DecisionRecord[];
  selection: RuleSelection; waveSchedule: { kind: 'table'; days: number[] } | { kind: 'interval'; everyDays: number; firstDay: number };
  gatherMode: 'node_depletion' | 'per_action';
  capabilities: Record<VillageCapability, { configured: boolean; missing: string[] }>;
  diagnostics: Diagnostic[];
}
