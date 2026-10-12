import type { ContactReaction, NpcId } from './types';
import { createReactionSamples, VOCAL_SAMPLE_RATE } from './vocal';

export type SoundCue = 'click' | 'harvest' | 'warning' | 'success';

interface Voice { oscillator: AudioScheduledSourceNode; gain: GainNode }
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
  private reactionTimes = new Map<NpcId, number>();
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private spoken: SpeechSynthesisUtterance | null = null;
  private generation = 0;

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
    if (!enabled) this.stop();
  }

  /** Only an already-unlocked audio device can play a reaction. Never creates one in the game loop. */
  playReaction(npcId: NpcId, reaction: ContactReaction): boolean {
    const context = this.context;
    if (!this.soundEnabled || !context || !this.master || context.state !== 'running') return false;
    if (context.currentTime - (this.reactionTimes.get(npcId) ?? -Infinity) < .9 || this.activeVoices.size >= 10) return false;
    this.reactionTimes.set(npcId, context.currentTime);
    try {
      const samples = createReactionSamples(reaction.kind, npcId, reaction.intensity);
      const buffer = context.createBuffer(1, samples.length, VOCAL_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = reaction.kind === 'bump' ? .66 : 1.45;
      source.connect(gain); gain.connect(this.master);
      const voice: Voice = { oscillator: source, gain };
      this.activeVoices.add(voice);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.activeVoices.delete(voice); };
      source.start();
      this.speakComplaint(npcId, reaction);
      return true;
    } catch { return false; }
  }

  /** Pause, mute, page hide and restart cancel both playing and not-yet-started voices. */
  stop(): void {
    this.generation++;
    if (this.speechTimer !== null) { clearTimeout(this.speechTimer); this.speechTimer = null; }
    if (this.spoken) {
      this.spoken.onend = null; this.spoken.onerror = null;
      try { globalThis.speechSynthesis?.cancel(); } catch { /* Missing/changing speech service. */ }
      this.spoken = null;
    }
    this.reactionTimes.clear(); this.lastPlayed.clear();
    this.stopVoices();
  }

  private speakComplaint(npcId: NpcId, reaction: ContactReaction): void {
    if (!reaction.utterance || this.speechTimer !== null || this.spoken) return;
    const synth = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!synth || !Utterance) return;
    try {
      // Remote device voices would break the offline promise. No silent network TTS fallback.
      const voice = synth.getVoices().find(candidate => candidate.localService && /^(zh|cmn)([-_]|$)/i.test(candidate.lang));
      if (!voice || synth.speaking || synth.pending) return;
      const generation = this.generation;
      this.speechTimer = setTimeout(() => {
        this.speechTimer = null;
        if (generation !== this.generation || !this.soundEnabled || synth.speaking || synth.pending) return;
        try {
          const utterance = new Utterance(reaction.utterance.slice(0, 100));
          utterance.lang = voice.lang; utterance.voice = voice;
          utterance.pitch = npcId === 'xiaomi' ? 1.28 : npcId === 'laozhou' ? .77 : 1;
          utterance.rate = reaction.kind === 'burn' ? 1.15 : 1.04;
          utterance.volume = .8;
          utterance.onend = utterance.onerror = () => { if (this.spoken === utterance) this.spoken = null; };
          this.spoken = utterance;
          synth.speak(utterance);
        } catch { this.spoken = null; }
      }, reaction.kind === 'bump' ? 200 : 480);
    } catch { /* The local nonverbal cry and caption remain available. */ }
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
    this.stop();
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
