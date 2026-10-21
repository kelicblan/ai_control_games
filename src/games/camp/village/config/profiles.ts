import { sha256HexFallback } from '../../../../shared/crypto/sha256';
import type { CompiledVillageRules, DecisionRecord, Diagnostic, JsonValue, RawWorkbook, RuleSelection, VillageCapability } from './schema';
import { decodeRawWorkbook } from './schema';

export function canonicalRules(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalRules).join(',')}]`;
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalRules((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  throw new Error('规则只接受有限 JSON 数据');
}
export function hashRules(value: unknown): string {
  return sha256HexFallback(new TextEncoder().encode(canonicalRules(value)));
}
export function freezeRules<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeRules);
    Object.freeze(value);
  }
  return value;
}
export class RuleCompilationError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(d => `${d.location}: ${d.message}`).join('\n'));
    this.name = 'RuleCompilationError';
  }
}
const object = (value: JsonValue | undefined): value is { [key: string]: JsonValue } => !!value && typeof value === 'object' && !Array.isArray(value);
const requiredIds = Array.from({ length: 20 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`);
const alternatives: Record<string, string[]> = {
  D01: ['table', 'interval'], D02: ['source-detail-counts'], D03: ['node_depletion', 'per_action'], D04: ['growth-once'],
  D05: ['actor-and-fence-separate'], D06: ['softened-attack', 'full-threat'], D07: ['hit-crit-defense-floor-minimum'],
  D08: ['add-speed-override-range'], D09: ['whole-fence-with-breach'], D18: ['disabled'], D19: ['world-mode-isolation'], D20: ['source-yields'],
};
for (let i = 10; i <= 17; i++) alternatives[`D${i}`] = ['explicit-supplement'];
const supplementFields: Record<string, string[]> = {
  D10: ['repairHpPerJob', 'repairWorkSeconds', 'upgradeWorkSeconds', 'craftWorkFormula'],
  D11: ['professionEffects'], D12: ['foodPerRecruitPerDay', 'foodPerPlayerPerDay', 'meatFoodRatio', 'foodSupply'],
  D13: ['spawnRules', 'offerRules', 'recruitCost', 'initialRoster', 'heroUniqueness'],
  D14: ['xpThresholds', 'xpSources', 'levelHpPolicy'], D15: ['explorationEventSeconds', 'explorationDamage', 'distanceLevelRules'],
  D16: ['healFoodCost', 'healHp', 'downedSeconds', 'playerDefeatPolicy', 'afterLastWave'],
  D17: ['spaceUnits', 'baseMoveSpeed', 'baseGatherWork', 'carryCapacity'],
};
const numericFields = new Set(['repairHpPerJob', 'repairWorkSeconds', 'upgradeWorkSeconds', 'foodPerRecruitPerDay', 'foodPerPlayerPerDay',
  'meatFoodRatio', 'explorationEventSeconds', 'explorationDamage', 'healFoodCost', 'healHp', 'downedSeconds', 'baseMoveSpeed', 'baseGatherWork', 'carryCapacity']);
const zeroAllowed = new Set(['foodPerRecruitPerDay', 'foodPerPlayerPerDay', 'explorationDamage', 'healFoodCost']);
const optionalSupplementFields: Record<string,string[]> = { D12: ['starvationDamage'] };
numericFields.add('starvationDamage');zeroAllowed.add('starvationDamage');
const enums: Record<string, string[]> = {
  craftWorkFormula: ['source-seconds-divided-by-craft'], levelHpPolicy: ['preserve-current', 'preserve-ratio'],
  spaceUnits: ['world-meter'], playerDefeatPolicy: ['rescue-or-defeat'], afterLastWave: ['continue-without-new-waves'],
  heroUniqueness: ['unique-heroes', 'repeatable-prototypes'],
};
function validStructure(field: string, value: JsonValue, raw: RawWorkbook): boolean {
  const positive = (v: JsonValue | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const recruitable = new Set(raw.tables.actors.filter(a => a.kind !== 'player').map(a => a.id));
  if (field === 'xpThresholds') return Array.isArray(value) && value.length === 10 && value[0] === 0
    && value.every((v, i) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && (i === 0 || v > (value[i - 1] as number)));
  if (field === 'initialRoster') return Array.isArray(value) && value.length <= raw.tables.globals.RECRUIT_MAX && value.every(id => typeof id === 'string' && recruitable.has(id));
  if (field === 'distanceLevelRules') return Array.isArray(value) && value.length > 0 && value.every((item, i) => object(item)
    && typeof item.minimumDistance === 'number' && Number.isFinite(item.minimumDistance) && item.minimumDistance >= 0
    && typeof item.level === 'number' && Number.isSafeInteger(item.level) && item.level >= 1 && item.level <= 10
    && (i === 0 ? item.minimumDistance === 0 : item.minimumDistance > ((value[i - 1] as { minimumDistance: number }).minimumDistance)));
  if (!object(value) || !Object.keys(value).length) return false;
  if (field === 'xpSources') return Object.keys(value).every(k => ['gather', 'craft', 'build', 'repair', 'combat', 'explore', 'rescue', 'delivery'].includes(k)) && Object.values(value).every(positive);
  if (field === 'recruitCost') return Object.keys(value).every(k => ['wood', 'stone', 'rope', 'food'].includes(k))
    && Object.values(value).every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
  if (field === 'spawnRules') return Object.keys(value).every(k => ['intervalDays', 'maxOffers'].includes(k)) && positive(value.intervalDays)
    && typeof value.maxOffers === 'number' && Number.isSafeInteger(value.maxOffers) && value.maxOffers > 0;
  if (field === 'offerRules') return Object.keys(value).every(k => ['archetypeIds', 'expiresAfterDays'].includes(k)) && positive(value.expiresAfterDays)
    && Array.isArray(value.archetypeIds) && value.archetypeIds.length > 0 && value.archetypeIds.every(id => typeof id === 'string' && recruitable.has(id));
  if (field === 'foodSupply') return Object.keys(value).every(k => ['kind', 'sourceId', 'siteCount', 'capacity', 'workSeconds', 'refillSeconds'].includes(k))
    && ['legacy-adapter', 'configured-nodes', 'fixture'].includes(String(value.kind)) && typeof value.sourceId === 'string' && value.sourceId.trim().length > 0
    && ['siteCount','capacity','workSeconds','refillSeconds'].every(k => value[k] === undefined || positive(value[k]))
    && (value.siteCount === undefined || Number.isSafeInteger(value.siteCount) && Number(value.siteCount) <= 20)
    && (value.capacity === undefined || Number.isSafeInteger(value.capacity));
  if (field === 'professionEffects') return Object.entries(value).every(([id, effects]) => recruitable.has(id) && object(effects)
    && Object.keys(effects).length > 0 && Object.keys(effects).every(k => ['gatherMultiplier', 'craftMultiplier', 'repairMultiplier', 'materialCostMultiplier'].includes(k))
    && Object.values(effects).every(positive));
  return false;
}
const needs: Record<VillageCapability, [string, string[]][]> = {
  gather: [['D17', ['spaceUnits', 'baseMoveSpeed', 'baseGatherWork', 'carryCapacity']]],
  craft: [['D10', ['craftWorkFormula']]], upgradeFence: [['D10', ['upgradeWorkSeconds']]],
  repairFence: [['D10', ['repairHpPerJob', 'repairWorkSeconds']]],
  recruit: [['D13', supplementFields.D13], ['D12', supplementFields.D12]],
  progression: [['D14', supplementFields.D14]], explore: [['D15', supplementFields.D15], ['D17', supplementFields.D17]],
  recovery: [['D16', supplementFields.D16]], combat: [['D17', ['spaceUnits', 'baseMoveSpeed']], ['D16', supplementFields.D16]],
};

/** 原表、具名试验选择、批准记录独立保存；这里只编译配置，不写运行中世界。 */
export function resolveRules(raw: RawWorkbook, decisions: DecisionRecord[], mode: 'draft' | 'release', selection?: RuleSelection): CompiledVillageRules {
  decodeRawWorkbook(raw);
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, location: string, message: string) => diagnostics.push({ code, location, message, severity: 'error' });
  if (mode !== 'draft' && mode !== 'release') error('invalid_mode', 'mode', 'Unknown compilation mode');
  if (raw.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(raw.inputHash) || raw.sheets.length !== 11 || raw.diagnostics.some(d => d.severity === 'error')) {
    error('invalid_workbook', 'source', '原表导入存在错误或版本不兼容');
  }
  if (!selection || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(selection.id) || !['experiment', 'fixture', 'approved'].includes(selection.classification)) {
    error('missing_selection', 'selection', '必须显式提供具名试验或批准方案');
    throw new RuleCompilationError(diagnostics);
  }
  try { canonicalRules(selection); canonicalRules(raw); canonicalRules(decisions); }
  catch { error('invalid_json', 'selection', '规则包含非有限数值或非 JSON 数据'); throw new RuleCompilationError(diagnostics); }
  const byId = new Map<string, DecisionRecord>();
  for (const d of decisions) {
    if (!requiredIds.includes(d.id) || byId.has(d.id)) error('decision_id', d.id, '未知或重复决策 ID');
    byId.set(d.id, d);
  }
  for (const id of Object.keys(selection.choices)) if (!requiredIds.includes(id)) error('choice_id', id, '未知选择 ID');
  for (const id of requiredIds) {
    const d = byId.get(id), chosen = selection.choices[id];
    if (!d) { error('missing_decision', id, '缺少原始决策登记'); continue; }
    if (!chosen || !alternatives[id].includes(chosen.selectedAlternative) || !object(chosen.effectiveValues)) {
      error('invalid_choice', id, '缺少显式选择或不支持该方案'); continue;
    }
    if (mode === 'release') {
      if (d.status !== 'accepted') error('unapproved_decision', id, '决策尚未批准');
      else if (!d.decidedBy?.trim() || !d.decidedAt || !Number.isFinite(Date.parse(d.decidedAt)) || !d.rationale?.trim()
        || d.selectedAlternative !== chosen.selectedAlternative || canonicalRules(d.effectiveValues ?? null) !== canonicalRules(chosen.effectiveValues)) {
        error('missing_approval_evidence', id, '缺少完整 approval 批准记录或批准值与当前选择不同');
      }
    }
    if (supplementFields[id]) {
      for (const [field, value] of Object.entries(chosen.effectiveValues)) {
        if (!supplementFields[id].includes(field) && !optionalSupplementFields[id]?.includes(field)) { error('unknown_parameter', `${id}.${field}`, '未知补充参数'); continue; }
        if (numericFields.has(field) && (typeof value !== 'number' || !Number.isFinite(value) || (zeroAllowed.has(field) ? value < 0 : value <= 0))) error('invalid_parameter', `${id}.${field}`, '参数必须是有效正数或指定的非负数');
        else if (enums[field] && (typeof value !== 'string' || !enums[field].includes(value))) error('invalid_parameter', `${id}.${field}`, '参数枚举未登记');
        else if (!numericFields.has(field) && !enums[field] && !validStructure(field, value, raw)) error('invalid_parameter', `${id}.${field}`, '结构化参数缺失、为空或不符合显式契约');
      }
    } else if (id === 'D01' && chosen.selectedAlternative === 'interval') {
      const { everyDays, firstDay } = chosen.effectiveValues;
      if (typeof everyDays !== 'number' || !Number.isSafeInteger(everyDays) || everyDays < 1 || typeof firstDay !== 'number' || !Number.isSafeInteger(firstDay) || firstDay < 1
        || Object.keys(chosen.effectiveValues).some(k => !['everyDays', 'firstDay'].includes(k))) error('invalid_interval', id, '只允许正整数 everyDays 与 firstDay');
    } else if (id === 'D18') {
      if (canonicalRules(chosen.effectiveValues) !== canonicalRules({ captainAura: false, bleeding: false, dynamicWaves: false })) error('optional_features', id, '基础方案不启用未经设计的可选能力');
    } else if (Object.keys(chosen.effectiveValues).length) error('unknown_parameter', id, '该方案不接受隐式参数或双重结算开关');
  }
  if (mode === 'release' && selection.classification !== 'approved') error('unapproved_profile', 'selection', '正式规则不得使用 experiment 或 fixture');
  const capabilities = {} as CompiledVillageRules['capabilities'];
  for (const capability of Object.keys(needs) as VillageCapability[]) {
    const missing = needs[capability].flatMap(([id, keys]) => keys.filter(key => {
      const values = selection.choices[id]?.effectiveValues;
      return !object(values) || values[key] === undefined;
    }));
    capabilities[capability] = { configured: missing.length === 0, missing };
    if (mode === 'release' && missing.length) error('missing_supplement', capability, `缺少正式能力必需参数：${missing.join(', ')}`);
  }
  if (diagnostics.length) throw new RuleCompilationError(diagnostics);
  const waveChoice = selection.choices.D01;
  const interval = waveChoice.effectiveValues as { everyDays: number; firstDay: number };
  const base: Omit<CompiledVillageRules, 'ruleHash'> = {
    schemaVersion: 1, worldMode: 'village-v1', ruleVersion: selection.id, mode, classification: selection.classification,
    sourceWorkbookHash: raw.inputHash, clock: { daylightSeconds: raw.tables.globals.DAY_DURATION_MIN * 60, nightSeconds: raw.tables.globals.NIGHT_DURATION_MIN * 60 },
    tables: structuredClone(raw.tables), sourceMap: structuredClone(raw.sourceMap), decisions: structuredClone(decisions), selection: structuredClone(selection),
    waveSchedule: waveChoice.selectedAlternative === 'table' ? { kind: 'table', days: raw.tables.waves.map(w => w.day) }
      : { kind: 'interval', everyDays: interval.everyDays, firstDay: interval.firstDay },
    gatherMode: selection.choices.D03.selectedAlternative as CompiledVillageRules['gatherMode'], capabilities, diagnostics: [],
  };
  if (!(base.clock.daylightSeconds > 0) || !(base.clock.nightSeconds > 0)) throw new RuleCompilationError([{ code: 'invalid_clock', location: 'clock', severity: 'error', message: '日段时长必须为正' }]);
  return freezeRules({ ...base, ruleHash: hashRules(base) });
}
