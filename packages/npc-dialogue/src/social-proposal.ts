/** Shared wire decoder. Selection cannot authorize any world mutation. */
export function parseSocialSelection(raw: string, allowed: string[]): string | null {
  const value = JSON.parse(raw) as { choice?: unknown };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.choice !== 'string') throw new Error('Invalid social selection');
  if (value.choice !== 'none' && !allowed.includes(value.choice)) throw new Error('Unknown social selection'); return value.choice === 'none' ? null : value.choice;
}
