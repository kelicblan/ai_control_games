export const AGENCY_V1 = Object.freeze({ version: 'utility-v1', recentLimit: 48, evidenceLimit: 12,
  summaryBatch: 64, maxActiveGroups: 3, perNpcInflight: 1, globalInflight: 2,
  appraisalCooldown: 15, invitationCooldown: 30, intentMinDuration: 10, appraisalTtl: 45,
  maxEmotionDelta: .08, modelPreferenceLimit: .25, maxInvitationsPerNpcPerRound: 1 });
export function validAgencyConfig(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(AGENCY_V1).length && Object.entries(AGENCY_V1).every(([key, expected]) =>
    typeof expected === 'string' ? record[key] === expected : typeof record[key] === 'number'
      && Number.isFinite(record[key]) && (record[key] as number) > 0 && (record[key] as number) <= expected);
}
