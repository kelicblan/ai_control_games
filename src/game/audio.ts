export type SoundCue = 'click' | 'harvest' | 'warning' | 'success';

interface Voice { oscillator: OscillatorNode; gain: GainNode }
interface Tone { frequency: number; endFrequency?: number; offset: number; duration: number; volume: number; type?: OscillatorType }

const SOUNDS: Record<SoundCue, readonly Tone[]> = {
  click: [{ frequency: 570, endFrequency: 370, offset: 0, duration: 0.045, volume: 0.25 }],
  harvest: [
    { frequency: 660, endFrequency: 640, offset: 0, duration: 0.12, volume: 0.22, type: 'triangle' },
    { frequency: 880, offset: 0.065, duration: 0.16, volume: 0.16 },
  ],
  warning: [
    { frequency: 294, offset: 0, duration: 0.2, volume: 0.23 },
    { frequency: 247, offset: 0.24, duration: 0.24, volume: 0.2 },
  ],
  success: [
    { frequency: 523.25, offset: 0, duration: 0.23, volume: 0.22, type: 'triangle' },
    { frequency: 659.25, offset: 0.12, duration: 0.27, volume: 0.21 },
    { frequency: 783.99, offset: 0.24, duration: 0.32, volume: 0.19 },
    { frequency: 1046.5, offset: 0.38, duration: 0.45, volume: 0.13 },
  ],
};
const MIN_INTERVAL: Record<SoundCue, number> = { click: 0.04, harvest: 0.15, warning: 1.2, success: 1 };

/** Tiny synthesized effects. Construction/import never starts an AudioContext. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private activeVoices = new Set<Voice>();
  private lastPlayed = new Map<SoundCue, number>();
  private soundEnabled = true;

  get enabled(): boolean { return this.soundEnabled; }

  /** Call from a click, tap or keyboard handler; gracefully fails if unavailable. */
  async unlock(): Promise<boolean> {
    if (!this.soundEnabled) return false;
    if (typeof navigator !== 'undefined' && navigator.userActivation
      && !navigator.userActivation.hasBeenActive && !navigator.userActivation.isActive) return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        const audioGlobal = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
        const Context = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
        this.lastPlayed.clear();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (!enabled) this.stopVoices();
  }

  /** Never unlocks implicitly, so game timers cannot bypass autoplay rules. */
  play(cue: SoundCue): void {
    const context = this.context;
    if (!this.soundEnabled || !context || !this.master || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(cue) ?? -Infinity) < MIN_INTERVAL[cue] || this.activeVoices.size >= 12) return;
    this.lastPlayed.set(cue, now);
    for (const tone of SOUNDS[cue]) this.playTone(tone, now);
  }

  private playTone(tone: Tone, now: number): void {
    const context = this.context;
    if (!context || !this.master || this.activeVoices.size >= 12) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + tone.offset;
      const end = start + tone.duration;
      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.volume, start + Math.min(0.012, tone.duration / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(this.master);
      const voice: Voice = { oscillator, gain };
      this.activeVoices.add(voice);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.activeVoices.delete(voice);
      };
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    } catch { /* Audio device changes must never interrupt the game. */ }
  }

  private stopVoices(): void {
    for (const { oscillator, gain } of this.activeVoices) {
      try { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); } catch { /* Already ended. */ }
    }
    this.activeVoices.clear();
  }

  async dispose(): Promise<void> {
    this.stopVoices();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.lastPlayed.clear();
    if (context && context.state !== 'closed') {
      try { await context.close(); } catch { /* Closing is best effort. */ }
    }
  }
}

export const gameAudio = new GameAudio();
