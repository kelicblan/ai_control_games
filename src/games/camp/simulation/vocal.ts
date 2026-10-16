import type { NpcId, ReactionKind } from './types';

export const VOCAL_SAMPLE_RATE = 22050;
export const NPC_VOICE_PROFILES: Record<NpcId, { pitch: number; formant: number; speech: number }> = {
  azhuang: { pitch: 151, formant: 1, speech: 1 },
  xiaomi: { pitch: 238, formant: 1.16, speech: 1.28 },
  laozhou: { pitch: 108, formant: .87, speech: .77 },
  linlan: { pitch: 203, formant: 1.08, speech: 1.14 },
  aye: { pitch: 178, formant: 1.03, speech: 1.06 },
  tiesheng: { pitch: 126, formant: .92, speech: .86 },
  aling: { pitch: 219, formant: 1.12, speech: 1.21 },
  xiaoman: { pitch: 192, formant: 1.06, speech: 1.1 },
  shenyan: { pitch: 163, formant: .98, speech: .95 },
};
const PROFILE = {
  burn: { duration: .95, formants: [850, 1400, 2700], breath: .09, pitch: 1.52, pulses: 2 },
  thorns: { duration: .72, formants: [340, 1850, 2900], breath: .62, pitch: 1.16, pulses: 1 },
  impact: { duration: .58, formants: [620, 1000, 2300], breath: .12, pitch: .93, pulses: 2 },
  water: { duration: 1.05, formants: [450, 1200, 2450], breath: .35, pitch: 1.24, pulses: 4 },
  bump: { duration: .32, formants: [430, 1050, 2250], breath: .1, pitch: .82, pulses: 1 },
} satisfies Record<ReactionKind, { duration: number; formants: number[]; breath: number; pitch: number; pulses: number }>;

/** Deterministic formant-shaped nonverbal cries. No recordings, model service, or microphone. */
export function createReactionSamples(kind: ReactionKind, npc: NpcId, intensity: number, sampleRate = VOCAL_SAMPLE_RATE): Float32Array {
  const profile = PROFILE[kind];
  const rate = Math.min(48000, Math.max(8000, Math.round(sampleRate) || VOCAL_SAMPLE_RATE));
  const strength = Number.isFinite(intensity) ? Math.min(1, Math.max(.1, intensity)) : .5;
  const { pitch, formant } = NPC_VOICE_PROFILES[npc];
  const samples = new Float32Array(Math.ceil(rate * profile.duration));
  const resonators = profile.formants.map((frequency, index) => {
    const omega = 2 * Math.PI * Math.min(rate * .42, frequency * formant) / rate;
    const alpha = Math.sin(omega) / (2 * (index === 0 ? 4 : 7));
    return { b: alpha / (1 + alpha), a1: -2 * Math.cos(omega) / (1 + alpha), a2: (1 - alpha) / (1 + alpha), y1: 0, y2: 0 };
  });
  let phase = 0; let x1 = 0; let x2 = 0; let peak = 0;
  let noiseState = (kind.length * 131 + npc.length * 977 + pitch) >>> 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate;
    const progress = i / Math.max(1, samples.length - 1);
    // Falling pitch reads as pain, unlike a flat game notification tone.
    const contour = .74 + .62 * Math.exp(-progress * 3.4) + .07 * Math.sin(time * 2 * Math.PI * (kind === 'water' ? 16 : 5.8));
    phase = (phase + pitch * profile.pitch * contour / rate) % 1;
    noiseState ^= noiseState << 13; noiseState ^= noiseState >>> 17; noiseState ^= noiseState << 5;
    const noise = (noiseState >>> 0) / 2147483648 - 1;
    const glottal = Math.sin(phase * Math.PI * 2) + .43 * Math.sin(phase * Math.PI * 4) + .23 * Math.sin(phase * Math.PI * 6) + .17 * (2 * phase - 1);
    const input = glottal * (1 - profile.breath) + noise * profile.breath;
    let vocal = .09 * glottal;
    for (let band = 0; band < resonators.length; band++) {
      const r = resonators[band];
      const value = r.b * (input - x2) - r.a1 * r.y1 - r.a2 * r.y2;
      r.y2 = r.y1; r.y1 = value;
      vocal += value * [1.4, .7, .28][band];
    }
    x2 = x1; x1 = input;
    const onset = Math.min(1, time / .018);
    const ending = Math.pow(Math.max(0, 1 - progress), .72);
    const syllable = .22 + .78 * Math.pow(Math.sin(Math.PI * progress * profile.pulses), 2);
    const value = Math.tanh(vocal * 2.3) * onset * ending * syllable;
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const scale = (.42 + strength * .4) / Math.max(.001, peak);
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
}
