import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReactionSamples } from '../src/games/camp/simulation/vocal';
import { GameAudio } from '../src/games/camp/simulation/audio';
import type { Atmosphere, ContactReaction, ReactionKind } from '../src/games/camp/simulation/types';

const burn: ContactReaction = { kind: 'burn', objectId: 'campfire', intensity: .8, utterance: '啊！烫到了！离火远一点。' };
const rainy: Atmosphere = { windStrength: .7, windAngle: .2, rainIntensity: .8, cloudCover: .9,
  stormRisk: .85, lightningAt: -1, lightningPoint: null, nextLightningAt: 12, revision: 1 };

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

  it('does not create an audio device from a timer or while muted', () => {
    const constructor = vi.fn();
    vi.stubGlobal('AudioContext', constructor);
    const sound = new GameAudio();
    expect(sound.playReaction('azhuang', burn)).toBe(false);
    sound.setEnabled(false);
    expect(sound.playReaction('azhuang', burn)).toBe(false);
    expect(constructor).not.toHaveBeenCalled();
  });

  it('cancels pending complaint speech when stopped and never queues speech without a local Chinese voice', async () => {
    vi.useFakeTimers();
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    expect(sound.playReaction('azhuang', burn)).toBe(true);
    sound.stop();
    vi.advanceTimersByTime(1500);
    expect(platform.speak).not.toHaveBeenCalled();
    expect(platform.stops()).toBeGreaterThan(0);

    platform.setVoices([{ lang: 'en-US', localService: true }, { lang: 'zh-CN', localService: false }]);
    expect(sound.playReaction('xiaomi', burn)).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(platform.speak).not.toHaveBeenCalled();
    await sound.dispose();
  });

  it('speaks the actual object-specific complaint once and interrupts it on mute', async () => {
    vi.useFakeTimers();
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    expect(sound.playReaction('xiaomi', burn)).toBe(true);
    expect(sound.playReaction('xiaomi', burn)).toBe(false);
    vi.advanceTimersByTime(1200);
    expect(platform.speak).toHaveBeenCalledTimes(1);
    expect(platform.speak.mock.calls[0][0].text).toBe(burn.utterance);
    expect(platform.speak.mock.calls[0][0].lang).toBe('zh-CN');
    sound.setEnabled(false);
    expect(platform.cancel).toHaveBeenCalledTimes(1);
    expect(sound.playReaction('azhuang', burn)).toBe(false);
    await sound.dispose();
  });
});

describe('weather sound lifetime', () => {
  it('keeps a bounded set of distinct environmental beds and releases them on pause and mute', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    const environment = { fire: 80, listener: { x: 55, y: 60 }, seed: 42 };
    sound.syncWeather(rainy, 5, true, environment);
    const initial = platform.sources.length;
    expect(initial).toBeGreaterThanOrEqual(4);
    expect(initial).toBeLessThanOrEqual(5);
    expect(new Set(platform.sources.map(source => source.buffer)).size).toBe(initial);
    for (const source of platform.sources) {
      const samples = source.buffer!.getChannelData(0);
      expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
      expect(rms(samples)).toBeGreaterThan(.04);
    }
    for (let i = 0; i < 100; i++) sound.syncWeather(rainy, 5 + i / 10, true, environment);
    expect(platform.sources).toHaveLength(initial);
    sound.syncWeather(rainy, 9, false);
    expect(platform.active()).toHaveLength(0);
    sound.syncWeather(rainy, 9, true, environment);
    expect(platform.active()).toHaveLength(initial);
    sound.setEnabled(false);
    expect(platform.active()).toHaveLength(0);
    const mutedCount = platform.sources.length;
    sound.syncWeather(rainy, 10, true);
    expect(platform.sources).toHaveLength(mutedCount);
    await sound.dispose();
  });

  it('brings the creek forward when the listening character approaches its bank', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    const calm = { ...rainy, windStrength: .1, rainIntensity: 0 };
    sound.syncWeather(calm, 5, true, { fire: 0, listener: { x: 10, y: 54 } });
    const distant = platform.ambientEnergy();
    sound.syncWeather(calm, 5, true, { fire: 0, listener: { x: 84, y: 54 } });
    expect(platform.ambientEnergy()).toBeGreaterThan(distant * 2);
    await sound.dispose();
  });

  it('lets the fire fade with its fuel level and leaves no crackling feed once extinguished', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    const calm = { ...rainy, windStrength: .1, rainIntensity: 0 };
    const listener = { x: 51, y: 58 };
    sound.syncWeather(calm, 5, true, { fire: 0, listener });
    const extinguished = platform.ambientEnergy();
    sound.syncWeather(calm, 5, true, { fire: 100, listener });
    const strong = platform.ambientEnergy();
    sound.syncWeather(calm, 5, true, { fire: 20, listener });
    const embers = platform.ambientEnergy();
    expect(strong).toBeGreaterThan(embers * 1.25);
    expect(embers).toBeGreaterThan(extinguished);
    sound.syncWeather(calm, 5, true, { fire: 0, listener });
    expect(platform.ambientEnergy()).toBeCloseTo(extinguished, 6);
    await sound.dispose();
  });

  it('moves wind ambience with the shared wind direction and falls back to mono when needed', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    sound.syncWeather({ ...rainy, windAngle: 0 }, 5, true);
    const first = platform.panners.map(node => node.pan.value);
    sound.syncWeather({ ...rainy, windAngle: Math.PI }, 5, true);
    const reversed = platform.panners.map(node => node.pan.value);
    expect(first.filter((value, index) => value * reversed[index] < -.01).length).toBeGreaterThanOrEqual(2);
    await sound.dispose();

    const mono = installAudioPlatform({ stereo: false });
    const fallback = new GameAudio();
    await fallback.unlock();
    expect(() => fallback.syncWeather(rainy, 5, true)).not.toThrow();
    expect(mono.ambientEnergy()).toBeGreaterThan(.002);
    await fallback.dispose();
  });

  it('plays each fresh thunder once and consumes muted or paused strikes without replay', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    sound.syncWeather(rainy, 10, true);
    const strike = { ...rainy, lightningAt: 10.1, lightningPoint: { x: 20, y: 20 } };
    sound.syncWeather(strike, 10.2, true);
    const thunderCount = platform.sources.filter(source => !source.loop).length;
    expect(thunderCount).toBeGreaterThan(0);
    sound.syncWeather(strike, 10.3, true);
    expect(platform.sources.filter(source => !source.loop)).toHaveLength(thunderCount);
    sound.stop();
    sound.syncWeather(strike, 10.3, false);
    sound.syncWeather(strike, 10.4, true);
    expect(platform.sources.filter(source => !source.loop)).toHaveLength(thunderCount);
    sound.setEnabled(false);
    sound.syncWeather({ ...strike, lightningAt: 11 }, 11.2, true);
    sound.setEnabled(true);
    sound.syncWeather({ ...strike, lightningAt: 11 }, 11.3, true);
    expect(platform.sources.filter(source => !source.loop)).toHaveLength(thunderCount);
    await sound.dispose();
  });

  it('delays and softens distant thunder, preserving a directional crack and rolling body', async () => {
    async function hear(point: { x: number; y: number }, timeScale = 1) {
      const platform = installAudioPlatform();
      const sound = new GameAudio();
      await sound.unlock();
      const environment = { fire: 0, listener: { x: 10, y: 50 }, timeScale };
      sound.syncWeather(rainy, 10, true, environment);
      sound.syncWeather({ ...rainy, lightningAt: 10.1, lightningPoint: point }, 10.1, true, environment);
      const layers = platform.sources.filter(source => !source.loop);
      const result = {
        delay: Math.min(...layers.map(source => source.startAt!)) - platform.contexts[0].currentTime,
        peak: Math.max(...layers.map(source => platform.peakGain(source))),
        layers: layers.length,
        pan: layers.map(source => platform.pan(source)),
      };
      await sound.dispose();
      return result;
    }
    const close = await hear({ x: 11, y: 50 });
    const far = await hear({ x: 90, y: 50 });
    const fast = await hear({ x: 90, y: 50 }, 4);
    expect(close.layers).toBeGreaterThanOrEqual(2);
    expect(far.delay).toBeGreaterThan(close.delay + .35);
    expect(far.delay).toBeLessThan(2);
    expect(far.peak).toBeLessThan(close.peak);
    expect(far.pan.every(value => value > 0)).toBe(true);
    expect(fast.delay).toBeCloseTo(far.delay / 4, 5);
  });

  it.each(['pause', 'mute', 'interruption', 'new game'] as const)('cancels an already scheduled thunder on %s', async interruption => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    const environment = { fire: 80, listener: { x: 10, y: 50 }, seed: 1 };
    sound.syncWeather(rainy, 10, true, environment);
    const strike = { ...rainy, lightningAt: 10.1, lightningPoint: { x: 90, y: 50 } };
    sound.syncWeather(strike, 10.1, true, environment);
    const thunder = platform.sources.filter(source => !source.loop);
    expect(thunder.length).toBeGreaterThan(0);
    if (interruption === 'pause') sound.syncWeather(strike, 10.2, false, environment);
    if (interruption === 'mute') sound.setEnabled(false);
    if (interruption === 'interruption') {
      platform.contexts[0].state = 'interrupted';
      sound.syncWeather(strike, 10.2, true, environment);
    }
    if (interruption === 'new game') sound.syncWeather(strike, 10.2, true, { ...environment, seed: 2 });
    for (const source of thunder) {
      expect(source.output).toBeUndefined();
      expect(source.stopAt).toBeLessThan(source.startAt!);
    }
    const before = platform.sources.filter(source => !source.loop).length;
    sound.setEnabled(true);
    await sound.unlock();
    sound.syncWeather(strike, 10.3, true, interruption === 'new game' ? { ...environment, seed: 2 } : environment);
    expect(platform.sources.filter(source => !source.loop)).toHaveLength(before);
    await sound.dispose();
  });

  it('rebuilds the sound graph after a closed device without retaining old nodes', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    sound.syncWeather(rainy, 5, true);
    const old = [...platform.sources];
    platform.contexts[0].state = 'closed';
    expect(await sound.unlock()).toBe(true);
    sound.syncWeather(rainy, 5.1, true);
    expect(platform.contexts).toHaveLength(2);
    expect(old.every(source => !source.output)).toBe(true);
    expect(platform.active().length).toBeGreaterThan(0);
    expect(platform.active().every(source => !old.includes(source))).toBe(true);
    await sound.dispose();
    expect(platform.nodes.every(node => !node.output)).toBe(true);
  });

  it('reports a failed unlock without generating sound and retries on the next gesture', async () => {
    const platform = installAudioPlatform({ initiallySuspended: true });
    const sound = new GameAudio();
    platform.rejectResume = true;
    expect(await sound.unlock()).toBe(false);
    sound.syncWeather(rainy, 5, true);
    expect(platform.active()).toHaveLength(0);
    platform.rejectResume = false;
    expect(await sound.unlock()).toBe(true);
    sound.syncWeather(rainy, 5.1, true);
    expect(platform.ambientEnergy()).toBeGreaterThan(.002);
    await sound.dispose();
  });

  it('does not report sound enabled when a pending device resume loses to mute', async () => {
    const platform = installAudioPlatform({ initiallySuspended: true, deferResume: true });
    const sound = new GameAudio();
    const unlocking = sound.unlock();
    sound.setEnabled(false);
    platform.finishResume(0);
    expect(await unlocking).toBe(false);
    sound.syncWeather(rainy, 5, true, { fire: 80, listener: { x: 51, y: 54 } });
    expect(platform.active()).toHaveLength(0);
    await sound.dispose();
  });

  it('returns a retryable failure when autoplay policy leaves resume pending indefinitely', async () => {
    vi.useFakeTimers();
    const platform = installAudioPlatform({ initiallySuspended: true, deferResume: true });
    const sound = new GameAudio();
    const finished = vi.fn();
    const unlocking = sound.unlock().then(finished);
    await vi.advanceTimersByTimeAsync(1600);
    expect(finished).toHaveBeenCalledWith(false);
    sound.setEnabled(false);
    platform.finishResume(0);
    await unlocking;
    sound.syncWeather(rainy, 5, true);
    expect(platform.active()).toHaveLength(0);
    await sound.dispose();
  });

  it('keeps a disposed pending resume separate from the replacement audio device', async () => {
    const platform = installAudioPlatform({ initiallySuspended: true, deferResume: true });
    const sound = new GameAudio();
    const oldUnlock = sound.unlock();
    await sound.dispose();
    const replacementUnlock = sound.unlock();
    platform.finishResume(0);
    expect(await oldUnlock).toBe(false);
    expect(platform.active()).toHaveLength(0);
    platform.finishResume(1);
    expect(await replacementUnlock).toBe(true);
    sound.syncWeather(rainy, 5, true);
    expect(platform.ambientEnergy()).toBeGreaterThan(.002);
    await sound.dispose();
    expect(platform.nodes.every(node => !node.output)).toBe(true);
  });
});

/** Web Audio/Speech are platform boundaries; assertions above observe delivered sound/speech, not private code. */
function installAudioPlatform(options: { stereo?: boolean; initiallySuspended?: boolean; deferResume?: boolean } = {}) {
  let stopped = 0;
  let started = 0;
  let voices = [{ lang: 'zh-CN', localService: true }];
  const sources: SourceProbe[] = [];
  const nodes: NodeProbe[] = [];
  const panners: (NodeProbe & { pan: ReturnType<typeof param> })[] = [];
  const contexts: Context[] = [];
  const pendingResumes = new Map<Context, () => void>();
  const controls = { rejectResume: false };
  function param(value = 0) {
    const events: number[] = [];
    return { value, events,
      setValueAtTime(next: number) { this.value = next; events.push(next); },
      exponentialRampToValueAtTime(next: number) { this.value = next; events.push(next); },
      linearRampToValueAtTime(next: number) { this.value = next; events.push(next); },
      setTargetAtTime(next: number) { this.value = next; events.push(next); },
      cancelScheduledValues() {}, cancelAndHoldAtTime() {},
    };
  }
  function node(): NodeProbe {
    const result: NodeProbe = { output: undefined, connect(target) { this.output = target; }, disconnect() { this.output = undefined; } };
    nodes.push(result);
    return result;
  }
  function path(source: NodeProbe) {
    const result: NodeProbe[] = [];
    for (let current: NodeProbe | undefined = source; current; current = current.output) result.push(current);
    return result;
  }
  class Context {
    state = options.initiallySuspended ? 'suspended' : 'running'; currentTime = 10; destination = node();
    constructor() { contexts.push(this); }
    createGain() { return Object.assign(node(), { gain: param() }); }
    createBuffer(_channels: number, length: number, sampleRate = 16_000) { const data = new Float32Array(length); return { length, sampleRate, getChannelData: () => data, copyToChannel: (values: Float32Array) => data.set(values) }; }
    createBufferSource() {
      const context = this;
      const source: SourceProbe = Object.assign(node(), { buffer: null, onended: null, loop: false, playbackRate: param(1), startAt: undefined, stopAt: undefined,
        start(when = context.currentTime) { started++; source.startAt = when; },
        stop(when = context.currentTime) { stopped++; source.stopAt = when; },
      });
      sources.push(source);
      return source;
    }
    createOscillator() { return Object.assign(this.createBufferSource(), { type: 'sine', frequency: param() }); }
    createBiquadFilter() { return Object.assign(node(), { type: 'lowpass', frequency: param(), Q: param() }); }
    createStereoPanner = options.stereo === false ? undefined : () => {
      const result = Object.assign(node(), { pan: param() });
      panners.push(result);
      return result;
    };
    async resume() {
      if (controls.rejectResume) throw new Error('Device unavailable');
      if (options.deferResume) await new Promise<void>(resolve => pendingResumes.set(this, resolve));
      this.state = 'running';
    }
    async close() { this.state = 'closed'; }
  }
  const speak = vi.fn(); const cancel = vi.fn();
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('speechSynthesis', { speaking: false, pending: false, getVoices: () => voices, speak, cancel });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; voice = null; pitch = 1; rate = 1; volume = 1; onend = null; onerror = null; constructor(text: string) { this.text = text; } });
  return { speak, cancel, sources, nodes, panners, contexts,
    finishResume: (index: number) => { pendingResumes.get(contexts[index])?.(); pendingResumes.delete(contexts[index]); },
    get rejectResume() { return controls.rejectResume; }, set rejectResume(value: boolean) { controls.rejectResume = value; },
    starts: () => started, stops: () => stopped, setVoices: (value: typeof voices) => { voices = value; },
    active: () => sources.filter(source => source.output),
    ambientEnergy: () => Math.sqrt(sources.filter(source => source.loop && source.output).reduce((sum, source) => {
      const level = path(source).reduce((value, current) => value * (current.gain?.value ?? 1), 1);
      return sum + (rms(source.buffer!.getChannelData(0)) * level) ** 2;
    }, 0)),
    peakGain: (source: SourceProbe) => path(source).reduce((value, current) => value * (current.gain ? Math.max(current.gain.value, ...current.gain.events) : 1), 1),
    pan: (source: SourceProbe) => path(source).find(current => current.pan)?.pan?.value ?? 0,
  };
}

interface NodeProbe {
  output?: NodeProbe;
  gain?: { value: number; events: number[] };
  pan?: { value: number; events: number[] };
  connect(target: NodeProbe): void;
  disconnect(): void;
}
interface SourceProbe extends NodeProbe {
  buffer: { getChannelData(channel: number): Float32Array } | null;
  loop: boolean;
  onended: (() => void) | null;
  startAt?: number;
  stopAt?: number;
}
function rms(values: Float32Array) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}
