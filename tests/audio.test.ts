import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReactionSamples } from '../src/game/vocal';
import { GameAudio } from '../src/game/audio';
import type { Atmosphere, ContactReaction, ReactionKind } from '../src/game/types';

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
  it('keeps two bounded ambient sources and stops both immediately on pause or mute', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    sound.syncWeather(rainy, 5, true);
    expect(platform.starts()).toBe(2);
    for (let i = 0; i < 40; i++) sound.syncWeather(rainy, 5 + i / 10, true);
    expect(platform.starts()).toBe(2);
    sound.syncWeather(rainy, 9, false);
    expect(platform.stops()).toBe(2);
    sound.syncWeather(rainy, 9, true);
    expect(platform.starts()).toBe(4);
    sound.setEnabled(false);
    expect(platform.stops()).toBe(4);
    sound.syncWeather(rainy, 10, true);
    expect(platform.starts()).toBe(4);
    await sound.dispose();
  });

  it('plays each fresh thunder once and never replays a paused or muted strike', async () => {
    const platform = installAudioPlatform();
    const sound = new GameAudio();
    await sound.unlock();
    sound.syncWeather(rainy, 10, true);
    const strike = { ...rainy, lightningAt: 10.1, lightningPoint: { x: 20, y: 20 } };
    sound.syncWeather(strike, 10.2, true);
    expect(platform.starts()).toBe(3);
    sound.syncWeather(strike, 10.3, true);
    expect(platform.starts()).toBe(3);
    sound.stop();
    sound.syncWeather(strike, 10.3, false);
    sound.syncWeather(strike, 10.4, true);
    expect(platform.starts()).toBe(5);
    sound.setEnabled(false);
    sound.syncWeather({ ...strike, lightningAt: 11 }, 11.2, true);
    sound.setEnabled(true);
    sound.syncWeather({ ...strike, lightningAt: 11 }, 11.3, true);
    expect(platform.starts()).toBe(7);
    await sound.dispose();
  });
});

/** Web Audio/Speech are platform boundaries; assertions above observe delivered sound/speech, not private code. */
function installAudioPlatform() {
  let stopped = 0;
  let started = 0;
  let voices = [{ lang: 'zh-CN', localService: true }];
  const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} };
  class Context {
    state = 'running'; currentTime = 10; destination = {};
    createGain() { return { gain: { ...param }, connect() {}, disconnect() {} }; }
    createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data, copyToChannel: (values: Float32Array) => data.set(values) }; }
    createBufferSource() { return { buffer: null, onended: null, loop: false, connect() {}, disconnect() {}, start() { started++; }, stop() { stopped++; } }; }
    createBiquadFilter() { return { type: 'lowpass', frequency: { ...param }, Q: { ...param }, connect() {}, disconnect() {} }; }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  const speak = vi.fn(); const cancel = vi.fn();
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('speechSynthesis', { speaking: false, pending: false, getVoices: () => voices, speak, cancel });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; voice = null; pitch = 1; rate = 1; volume = 1; onend = null; onerror = null; constructor(text: string) { this.text = text; } });
  return { speak, cancel, starts: () => started, stops: () => stopped, setVoices: (value: typeof voices) => { voices = value; } };
}
