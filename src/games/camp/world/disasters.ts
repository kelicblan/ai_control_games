import type { Point } from '../simulation/types';

/** Extension contract; concrete disaster rules will be added independently. */
export type DisasterPhase = 'warning' | 'onset' | 'impact' | 'recovery' | 'resolved';
export interface DisasterEvent {
  id: string;
  kind: string;
  phase: DisasterPhase;
  startedAt: number;
  phaseStartedAt: number;
  nextTransitionAt: number;
  epicenter?: Point;
  severity: number;
}
