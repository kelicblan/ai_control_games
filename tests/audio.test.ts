import { afterEach,describe,expect,it,vi } from 'vitest';
import type { ReactionKind } from '../src/games/camp/simulation/types';
import { createReactionSamples } from '../src/games/camp/simulation/vocal';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('source-specific local reaction sound', () => {
  it('produces audible, finite, bounded and distinct cries for each injury source and character', () => {
    const kinds: ReactionKind[] = ['burn', 'thorns', 'impact', 'water', 'bump'];
    const samples = kinds.map(kind => createReactionSamples(kind, 'azhuang', .8));
    for (const waveform of samples) {
      expect(waveform.length).toBeGreaterThan(4000);
      expect(waveform.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
      expect(waveform.reduce((sum, value) => sum + value * value, 0) / waveform.length).toBeGreaterThan(.001);
      expect(Math.abs(waveform.at(-1)!)).toBeLessThan(.02);
    }
    expect(new Set(samples.map(values => Array.from(values.slice(1000, 1020)).join(','))).size).toBe(5);
    expect(createReactionSamples('burn', 'xiaomi', .8)).not.toEqual(samples[0]);
    expect(createReactionSamples('burn', 'laozhou', .8)).not.toEqual(samples[0]);
    expect(createReactionSamples('burn', 'azhuang', .8)).toEqual(samples[0]);
  });
});
