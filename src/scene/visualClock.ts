/** Bounded presentation-only extrapolation between authoritative snapshots.
 * A stalled connection cannot advance weather animation indefinitely. */
export function advanceVisualTime(current: number, authoritative: number, dt: number, rate: number): number {
  return Math.min(authoritative + .35 * rate, current + dt * rate);
}
