import { expect, it } from 'vitest';
import { AGENCY_V1, validAgencyConfig } from '../packages/npc-core/src/agency-config';
it('bounds runtime memory and rejects non-finite and unknown configuration', () => {
  expect(validAgencyConfig(AGENCY_V1)).toBe(true);
  expect(validAgencyConfig({ ...AGENCY_V1, globalInflight: NaN })).toBe(false);
  expect(validAgencyConfig({ ...AGENCY_V1, recentLimit: -1 })).toBe(false);
  expect(validAgencyConfig({ ...AGENCY_V1, version: 'future' })).toBe(false);
});
