import source from './raw.json';
import correctedSource from './raw-v2.json';
import proposedDecisions from './decisions.json';
import draft from './draft-table-v1.json';
import lifeAlpha from './p2-life-alpha-v1.json';
import defenseAlpha from './p3-defense-alpha-v1.json';
import socialContent from './p4-social-content-v1.json';
import { decodeRawWorkbook, type CompiledVillageRules, type DecisionRecord, type RuleSelection } from './schema';
import { freezeRules, hashRules, resolveRules } from './profiles';

const legacyBase = { worldMode: 'legacy' as const, ruleVersion: 'legacy-v3', clock: { daylightSeconds: 420, nightSeconds: 180 }, observationSchemaVersion: 3 };
const legacy = freezeRules({ ...legacyBase, ruleHash: hashRules(legacyBase) });
export type LegacyWorldRules = typeof legacy;
let currentDraft: CompiledVillageRules | undefined;
let currentLifeAlpha: CompiledVillageRules | undefined;
let currentDefenseAlpha: CompiledVillageRules | undefined;
let currentSocialContent: CompiledVillageRules | undefined;

export function selectWorldRules(worldMode: 'village-v1', ruleVersion?: string): CompiledVillageRules;
export function selectWorldRules(worldMode?: string, ruleVersion?: string): LegacyWorldRules | CompiledVillageRules;
export function selectWorldRules(worldMode = 'legacy', ruleVersion?: string): LegacyWorldRules | CompiledVillageRules {
  if (worldMode === 'legacy') {
    if (ruleVersion !== undefined && ruleVersion !== legacy.ruleVersion) throw new Error('旧世界规则版本不匹配，禁止自动换用新规则');
    return legacy;
  }
  if (worldMode !== 'village-v1') throw new Error(`未知世界模式：${worldMode}`);
  if (ruleVersion === 'p4-social-content-v1') return currentSocialContent ??= resolveRules(decodeRawWorkbook(correctedSource), proposedDecisions as DecisionRecord[], 'draft', socialContent as RuleSelection);
  if (ruleVersion === 'p3-defense-alpha-v1') return currentDefenseAlpha ??= resolveRules(decodeRawWorkbook(correctedSource), proposedDecisions as DecisionRecord[], 'draft', defenseAlpha as RuleSelection);
  if (ruleVersion === 'p2-life-alpha-v1') return currentLifeAlpha ??= resolveRules(decodeRawWorkbook(source), proposedDecisions as DecisionRecord[], 'draft', lifeAlpha as RuleSelection);
  if (ruleVersion !== 'draft-table-v1') throw new Error('必须指定已注册的新规则版本；禁止使用隐式 latest 或未批准的 release');
  // 单点固定注册；不是任意配置文件路径或运行时热替换接口。
  return currentDraft ??= resolveRules(decodeRawWorkbook(source), proposedDecisions as DecisionRecord[], 'draft', draft as RuleSelection);
}
