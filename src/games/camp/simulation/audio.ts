import type { Atmosphere, ContactReaction, NpcId } from './types';
import { createReactionSamples, VOCAL_SAMPLE_RATE } from './vocal';
import { AMBIENT_KINDS, AMBIENT_SAMPLE_RATE, createEnvironmentSamples, environmentalMix, thunderMix } from './ambient';
import type { AmbientKind, AmbientMix, AudioEnvironment, TextureKind, ThunderMix } from './ambient';
export type { AudioEnvironment } from './ambient';

export type SoundCue = 'click' | 'harvest' | 'warning' | 'success';

interface Voice { oscillator: AudioScheduledSourceNode; gain: GainNode; nodes?: AudioNode[] }
interface WeatherVoice { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; nodes: AudioNode[]; panner: StereoPannerNode | null }
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

/** Offline effects and five bounded environmental beds. Construction never opens a device. */
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
  private weatherVoices = new Map<AmbientKind, WeatherVoice>();
  private textureBuffers = new Map<TextureKind, AudioBuffer>();
  private lastThunderAt = -1;
  private skipNextThunder = true;
  private environmentSeed: number | undefined;
  private lastEnvironmentTime = -Infinity;

  get enabled(): boolean { return this.soundEnabled; }

  /** Call from a click, tap or keyboard handler; gracefully fails if unavailable. */
  async unlock(): Promise<boolean> {
    if (!this.soundEnabled) return false;
    if (typeof navigator !== 'undefined' && navigator.userActivation
      && !navigator.userActivation.hasBeenActive && !navigator.userActivation.isActive) return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.stop();
        this.disconnectNodes(this.master ? [this.master] : []);
        const audioGlobal = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
        const Context = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        this.textureBuffers.clear();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
        this.lastPlayed.clear();
      }
      const context = this.context;
      // Some devices use an interrupted state after calls or route changes.
      if (context.state !== 'running') {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          // An autoplay-blocked resume is allowed to remain pending. Give the
          // explicit sound control a retryable result instead of a stuck spinner.
          const resumed = await Promise.race([
            context.resume().then(() => true),
            new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 1500); }),
          ]);
          if (!resumed) return false;
        } finally {
          if (timeout !== undefined) clearTimeout(timeout);
        }
      }
      // Mute, disposal or another device may have won while resume was pending.
      return this.soundEnabled && this.context === context && context.state === 'running';
    } catch {
      return false;
    }
  }

  setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (!enabled) this.stop();
  }

  /** Consume every snapshot, including muted/paused ones, so old lightning cannot replay. */
  syncWeather(atmosphere: Atmosphere, elapsed: number, playing: boolean, environment?: AudioEnvironment): void {
    const newWorld = environment?.seed !== undefined && this.environmentSeed !== undefined && environment.seed !== this.environmentSeed;
    if (newWorld || elapsed < this.lastEnvironmentTime - .001) this.stop();
    this.environmentSeed = environment?.seed;
    if (Number.isFinite(elapsed)) this.lastEnvironmentTime = elapsed;
    const changed = atmosphere.lightningAt > this.lastThunderAt;
    const skip = this.skipNextThunder;
    this.lastThunderAt = atmosphere.lightningAt;
    this.skipNextThunder = false;
    const context = this.context;
    if (!playing || !this.soundEnabled || !context || !this.master || context.state !== 'running') {
      // Cancel delayed thunder as well as loops; an interrupted device must not
      // emit its queued strike when the player later resumes it.
      this.stop();
      return;
    }
    const mix = environmentalMix(atmosphere, elapsed, environment);
    for (const kind of AMBIENT_KINDS) this.setWeatherVoice(kind, mix[kind]);
    if (!skip && changed) {
      const thunder = thunderMix(atmosphere, elapsed, environment);
      if (thunder) this.playThunder(thunder);
    }
  }

  private getTextureBuffer(kind: TextureKind): AudioBuffer {
    const cached = this.textureBuffers.get(kind);
    if (cached) return cached;
    const samples = createEnvironmentSamples(kind);
    const buffer = this.context!.createBuffer(1, samples.length, AMBIENT_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    this.textureBuffers.set(kind, buffer);
    return buffer;
  }

  private createPanner(): StereoPannerNode | null {
    try { return typeof this.context?.createStereoPanner === 'function' ? this.context.createStereoPanner() : null; }
    catch { return null; }
  }

  private disconnectNodes(nodes: readonly AudioNode[]): void {
    for (const node of nodes) {
      try { node.disconnect(); } catch { /* A changing device may already have disconnected a node. */ }
    }
  }

  private setWeatherVoice(kind: AmbientKind, mix: AmbientMix): void {
    const context = this.context;
    if (!context || !this.master) return;
    let voice = this.weatherVoices.get(kind);
    if (!voice && mix.gain < .001) return;
    const created: AudioNode[] = [];
    try {
      if (!voice) {
        const source = context.createBufferSource(); created.push(source);
        const filter = context.createBiquadFilter(); created.push(filter);
        const gain = context.createGain(); created.push(gain);
        const panner = this.createPanner(); if (panner) created.push(panner);
        source.buffer = this.getTextureBuffer(kind); source.loop = true;
        source.playbackRate.value = mix.playbackRate;
        filter.type = kind === 'leaves' ? 'bandpass' : kind === 'rain' || kind === 'fire' ? 'highpass' : 'lowpass';
        filter.frequency.value = mix.frequency;
        filter.Q.value = kind === 'leaves' ? .6 : .707;
        gain.gain.value = 0;
        source.connect(filter);
        // Creek and fire keep a broad body without sharp synthetic fizz.
        if (kind === 'water' || kind === 'fire') {
          const colour = context.createBiquadFilter(); created.push(colour);
          colour.type = kind === 'water' ? 'highpass' : 'lowpass';
          colour.frequency.value = kind === 'water' ? 90 : 5100;
          colour.Q.value = .707;
          filter.connect(colour); colour.connect(gain);
        } else filter.connect(gain);
        if (panner) { panner.pan.value = mix.pan; gain.connect(panner); panner.connect(this.master); }
        else gain.connect(this.master);
        voice = { source, gain, filter, panner, nodes: [...created] };
        this.weatherVoices.set(kind, voice);
        source.start();
      }
      // Reuse the graph and ease every parameter; selection and gust changes do
      // not restart recordings. Extinguished fires settle to silence quickly.
      voice.gain.gain.setTargetAtTime(mix.gain, context.currentTime, kind === 'fire' && mix.gain === 0 ? .055 : .16);
      voice.filter.frequency.setTargetAtTime(mix.frequency, context.currentTime, .2);
      voice.source.playbackRate.setTargetAtTime(mix.playbackRate, context.currentTime, .35);
      voice.panner?.pan.setTargetAtTime(mix.pan, context.currentTime, .18);
    } catch {
      this.disconnectNodes(created);
      if (voice) {
        try { voice.source.stop(); } catch { /* Not started or already stopped. */ }
        this.disconnectNodes(voice.nodes);
        this.weatherVoices.delete(kind);
      }
    }
  }

  private playThunder(mix: ThunderMix): void {
    const context = this.context;
    if (!context || !this.master || this.activeVoices.size > 10) return;
    for (const kind of ['thunderCrack', 'thunderBody'] as const) {
      const nodes: AudioNode[] = [];
      let voice: Voice | undefined;
      try {
        const source = context.createBufferSource(); nodes.push(source);
        const filter = context.createBiquadFilter(); nodes.push(filter);
        const gain = context.createGain(); nodes.push(gain);
        const panner = this.createPanner(); if (panner) nodes.push(panner);
        const body = kind === 'thunderBody';
        source.buffer = this.getTextureBuffer(kind);
        source.playbackRate.value = (body ? .88 : .92) + mix.variation * .14;
        filter.type = body ? 'lowpass' : 'bandpass';
        filter.frequency.value = body ? 850 - Math.min(430, mix.distance * 4) : 1800 - Math.min(1000, mix.distance * 9);
        filter.Q.value = body ? .707 : .45;
        const start = context.currentTime + mix.delay;
        const duration = body ? mix.duration : .28 + Math.min(.18, mix.distance * .002);
        const peak = mix.gain * (body ? 1 : .4 / (1 + mix.distance / 32));
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + (body ? .1 + Math.min(.13, mix.distance * .0015) : .012));
        if (body) {
          gain.gain.exponentialRampToValueAtTime(peak * .58, start + .6);
          gain.gain.exponentialRampToValueAtTime(peak * .78, start + 1.05);
        }
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        source.connect(filter); filter.connect(gain);
        if (panner) { panner.pan.value = mix.pan; gain.connect(panner); panner.connect(this.master); }
        else gain.connect(this.master);
        voice = { oscillator: source, gain, nodes };
        this.activeVoices.add(voice);
        const tracked = voice;
        source.onended = () => this.releaseVoice(tracked, false);
        source.start(start, body ? mix.variation * .4 : 0);
        source.stop(start + duration + .03);
      } catch {
        if (voice) this.releaseVoice(voice);
        else this.disconnectNodes(nodes);
      }
    }
  }

  private stopWeather(): void {
    for (const { source, nodes } of this.weatherVoices.values()) {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
      this.disconnectNodes(nodes);
    }
    this.weatherVoices.clear();
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
      source.onended = () => this.releaseVoice(voice, false);
      source.start();
      this.speakComplaint(npcId, reaction);
      return true;
    } catch { return false; }
  }

  /** Pause, mute, page hide and restart cancel both playing and not-yet-started voices. */
  stop(): void {
    this.generation++;
    this.skipNextThunder = true;
    this.stopWeather();
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
          utterance.pitch = { azhuang: 1, xiaomi: 1.28, laozhou: .77, linlan: 1.14, aye: 1.06 }[npcId];
          utterance.rate = reaction.kind === 'burn' ? 1.15 : 1.04;
          utterance.volume = .8;
          utterance.onend = utterance.onerror = () => { if (this.spoken === utterance) this.spoken = null; };
          this.spoken = utterance;
          synth.speak(utterance);
        } catch { this.spoken = null; }
      }, reaction.kind === 'bump' ? 200 : 480);
    } catch { /* The local nonverbal cry and caption remain available. */ }
  }

  /** Uses only an already-enabled local voice; never queues speech behind another line. */
  speakDialogue(npcId: NpcId, text: string): void {
    if (!this.soundEnabled || !this.context || this.context.state !== 'running') return;
    this.speakComplaint(npcId, { kind: 'bump', objectId: 'dialogue', intensity: 0, utterance: text });
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
      oscillator.onended = () => this.releaseVoice(voice, false);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    } catch { /* Audio device changes must never interrupt the game. */ }
  }

  private stopVoices(): void {
    for (const voice of this.activeVoices) this.releaseVoice(voice);
  }

  private releaseVoice(voice: Voice, stop = true): void {
    voice.oscillator.onended = null;
    if (stop) {
      try { voice.oscillator.stop(); } catch { /* Already ended. */ }
    }
    this.disconnectNodes(voice.nodes ?? [voice.oscillator, voice.gain]);
    this.activeVoices.delete(voice);
  }

  async dispose(): Promise<void> {
    this.stop();
    const context = this.context;
    this.disconnectNodes(this.master ? [this.master] : []);
    this.context = null;
    this.master = null;
    this.textureBuffers.clear();
    this.environmentSeed = undefined;
    this.lastEnvironmentTime = -Infinity;
    this.lastPlayed.clear();
    if (context && context.state !== 'closed') {
      try { await context.close(); } catch { /* Closing is best effort. */ }
    }
  }
}

export const gameAudio = new GameAudio();
