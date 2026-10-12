import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReactionSamples } from '../src/game/vocal';
import { GameAudio } from '../src/game/audio';
import type { ContactReaction, ReactionKind } from '../src/game/types';

const burn: ContactReaction = { kind: 'burn', objectId: 'campfire', intensity: .8, utterance: '啊！烫到了！离火远一点。' };

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

/** Web Audio/Speech are platform boundaries; assertions above observe delivered sound/speech, not private code. */
function installAudioPlatform() {
  let stopped = 0;
  let voices = [{ lang: 'zh-CN', localService: true }];
  const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  class Context {
    state = 'running'; currentTime = 10; destination = {};
    createGain() { return { gain: { ...param }, connect() {}, disconnect() {} }; }
    createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data, copyToChannel: (values: Float32Array) => data.set(values) }; }
    createBufferSource() { return { buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop() { stopped++; } }; }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  const speak = vi.fn(); const cancel = vi.fn();
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('speechSynthesis', { speaking: false, pending: false, getVoices: () => voices, speak, cancel });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; voice = null; pitch = 1; rate = 1; volume = 1; onend = null; onerror = null; constructor(text: string) { this.text = text; } });
  return { speak, cancel, stops: () => stopped, setVoices: (value: typeof voices) => { voices = value; } };
}
