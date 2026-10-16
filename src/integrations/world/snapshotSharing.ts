import type { GameState } from '../../games/camp/simulation/types';

/** Snapshots contain JSON values only. Preserve unchanged branches for UI consumers
 * without mutating either the last published state or the incoming response. */
function share(previous: unknown, next: unknown): unknown {
  if (previous === next) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object'
    || Array.isArray(previous) !== Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let unchanged = keys.length === Object.keys(before).length;
  const result = (Array.isArray(next) ? next.slice() : { ...after }) as Record<string, unknown>;
  for (const key of keys) {
    const value = share(before[key], after[key]);
    result[key] = value;
    unchanged &&= Object.hasOwn(before, key) && value === before[key];
  }
  return unchanged ? previous : result;
}

export function shareWorldState(previous: GameState | null, next: GameState | null): GameState | null {
  return share(previous, next) as GameState | null;
}
