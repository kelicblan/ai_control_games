/** TS authority and Unity Space adapter use logical meters, independent of camera. */
export function worldToLogicalUnits(value: number, worldUnitsPerMeter = 1) {
  if (!Number.isFinite(value) || !Number.isFinite(worldUnitsPerMeter) || worldUnitsPerMeter <= 0) throw new Error('Invalid logical units');
  return value / worldUnitsPerMeter;
}
