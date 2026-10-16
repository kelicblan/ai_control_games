/**
 * 可复用的 NPC 初始化配置契约。此包不读取浏览器、数据库或游戏状态。
 * 游戏注册字段目录，UI 和存储适配器共同使用同一份校验规则。
 */
export interface NumericField {
  id: string;
  label: string;
  group: string;
  description: string;
  min: number;
  max: number;
  step: number;
  /** 可选显示倍率。例如内部人格 0..1，界面显示 0..100。 */
  displayScale?: number;
  /** Preserve obsolete values for import/save compatibility without offering them for editing. */
  hidden?: boolean;
}
export interface CharacterDefinition {
  id: string;
  label: string;
  description?: string;
  defaults: Record<string, number>;
}
export interface SettingsCatalog {
  gameId: string;
  schemaVersion: number;
  characters: readonly CharacterDefinition[];
  fields: readonly NumericField[];
}
export interface NpcSettings {
  version: 1;
  gameId: string;
  schemaVersion: number;
  characters: Record<string, Record<string, number>>;
}
export interface SettingsSnapshot { revision: number; document: NpcSettings }
/**
 * revision=0 表示尚无保存记录。save 是整份文档的原子比较并写入；只有提交成功
 * 才返回新 revision。存储异常必须拒绝 Promise，不能默默切换到内存并宣称保存。
 */
export interface SettingsRepository {
  load(): Promise<SettingsSnapshot>;
  save(document: NpcSettings, expectedRevision: number): Promise<SettingsSnapshot>;
}
export class SettingsError extends Error {
  readonly code: 'invalid' | 'conflict' | 'storage';
  constructor(code: SettingsError['code'], message: string) {
    super(message); this.name = 'SettingsError'; this.code = code;
  }
}
const fail = (message: string): never => { throw new SettingsError('invalid', message); };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => own(value, key));
}
const safeId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(id)
  && !['__proto__', 'prototype', 'constructor'].includes(id);
export function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}
/** 不截断数值；非法输入需要明确反馈给编辑者，不能保存成另一个意思。 */
export function validateNumber(field: NumericField, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) {
    return fail(`${field.label}必须在 ${field.min}～${field.max} 之间。`);
  }
  const steps = (value - field.min) / field.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) return fail(`${field.label}的步长必须为 ${field.step}。`);
  return value;
}
/** 目录也来自外部宿主，拒绝重复 ID、危险键与错误的范围，避免 UI 和引擎解释不一致。 */
export function validateCatalog(catalog: SettingsCatalog): void {
  if (!safeId(catalog.gameId) || !Number.isSafeInteger(catalog.schemaVersion) || catalog.schemaVersion < 1) fail('配置目录版本或游戏 ID 无效。');
  if (!catalog.fields.length || catalog.fields.length > 128 || !catalog.characters.length || catalog.characters.length > 128) fail('角色和字段数量必须在 1～128 之间。');
  const fields = new Set<string>(), people = new Set<string>();
  for (const field of catalog.fields) {
    if (!safeId(field.id) || fields.has(field.id) || !field.label || !field.group
      || ![field.min, field.max, field.step, field.displayScale ?? 1].every(Number.isFinite)
      || field.max <= field.min || field.step <= 0 || (field.displayScale ?? 1) <= 0) fail('字段目录无效或包含重复 ID。');
    fields.add(field.id);
  }
  for (const character of catalog.characters) {
    if (!safeId(character.id) || people.has(character.id) || !character.label
      || !record(character.defaults) || !exactKeys(character.defaults, [...fields])) fail('角色目录无效或缺少默认值。');
    people.add(character.id);
    for (const field of catalog.fields) validateNumber(field, character.defaults[field.id]);
  }
}
export function defaultSettings(catalog: SettingsCatalog): NpcSettings {
  validateCatalog(catalog);
  const document: NpcSettings = { version: 1, gameId: catalog.gameId, schemaVersion: catalog.schemaVersion,
    characters: Object.fromEntries(catalog.characters.map(person => [person.id, { ...person.defaults }])) };
  if (JSON.stringify(document).length > 1_000_000) return fail('配置目录默认数据过大。');
  return document;
}
/** 返回独立快照，调用者编辑草稿不会改变默认目录、已保存模板或运行中的 NPC。 */
export function validateSettings(catalog: SettingsCatalog, input: unknown): NpcSettings {
  validateCatalog(catalog);
  if (!record(input) || !exactKeys(input, ['version', 'gameId', 'schemaVersion', 'characters'])
    || input.version !== 1 || input.gameId !== catalog.gameId || input.schemaVersion !== catalog.schemaVersion) {
    return fail('配置版本或所属游戏不匹配，未修改现有数据。');
  }
  const characters = input.characters;
  if (!record(characters) || !exactKeys(characters, catalog.characters.map(person => person.id))) return fail('角色名单不匹配。');
  const result = defaultSettings(catalog);
  for (const person of catalog.characters) {
    const values = characters[person.id];
    if (!record(values) || !exactKeys(values, catalog.fields.map(field => field.id))) return fail(`${person.label}的字段不完整或包含未知字段。`);
    for (const field of catalog.fields) result.characters[person.id][field.id] = validateNumber(field, values[field.id]);
  }
  if (JSON.stringify(result).length > 1_000_000) return fail('配置数据过大。');
  return result;
}
/** JSON 导入和数据库读取共用严格边界。未来版本不能被当前程序覆盖成旧格式。 */
export function parseSettings(catalog: SettingsCatalog, text: string): NpcSettings {
  if (text.length > 1_000_000) return fail('配置文件过大。');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return fail('配置不是有效的 JSON。'); }
  return validateSettings(catalog, parsed);
}
export function parseInput(field: NumericField, text: string): number {
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) return fail(`${field.label}不能为空，且必须是数字。`);
  return validateNumber(field, Number(text) / (field.displayScale ?? 1));
}
export function nextRevision(expected: number): number {
  if (!validRevision(expected) || expected >= Number.MAX_SAFE_INTEGER - 1) return fail('配置修订号无效或已到上限。');
  return expected + 1;
}
export function conflict(): never {
  throw new SettingsError('conflict', '配置已在其他页面更新。请重新载入后再编辑，当前草稿未覆盖数据库。');
}

/** 校验独立角色快照；存档迁移也复用这里，不能把损坏字段悄悄补成默认值。 */
export function validateValues(fields: readonly NumericField[], input: unknown): Record<string, number> {
  if (!record(input) || !exactKeys(input, fields.map(field => field.id))) return fail('角色属性字段不完整或包含未知字段。');
  return Object.fromEntries(fields.map(field => [field.id, validateNumber(field, input[field.id])]));
}
