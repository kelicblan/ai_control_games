import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, EMOTIONS } from '../src/game/types';
import type { ActionId, PolicyObservation } from '../src/game/types';
import { FEATURE_NAMES } from '../src/game/observation';
import { baselinePolicy, decodePolicy, inferPolicy, loadPolicy } from '../src/ai/policy';
import type { LoadedPolicy, PolicyManifest } from '../src/ai/policy';
import { sha256HexFallback } from '../src/ai/sha256';
import { teacherScores } from '../src/ai/teacher';

interface ParityCase {
  name: string;
  features: number[];
  allowed: ActionId[];
  actionLogits: number[];
  emotionLogits: number[];
  action: ActionId;
  emotion: typeof EMOTIONS[number];
  teacherAction: ActionId;
  teacherEmotion: typeof EMOTIONS[number];
  teacherActionScores: number[];
  teacherEmotionScores: number[];
}

let manifest: PolicyManifest;
let binary: ArrayBuffer;
let model: LoadedPolicy;
let cases: ParityCase[];

beforeAll(async () => {
  manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8')) as PolicyManifest;
  const bytes = await readFile('public/models/policy.f32');
  binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  model = decodePolicy(manifest, binary);
  cases = JSON.parse(await readFile('public/models/parity-fixtures.json', 'utf8')).cases;
});

afterEach(() => vi.unstubAllGlobals());

const observe = (item: ParityCase): PolicyObservation => ({
  features: [...item.features], allowed: [...item.allowed], npcId: 'azhuang',
});

describe('trained policy artifact', () => {
  it('contains the agreed schema, real finite weights, and honest measured metadata', () => {
    expect(manifest.featureNames).toEqual(FEATURE_NAMES);
    expect(manifest.observationSchemaVersion).toBe(2);
    expect(manifest.actions).toEqual(ACTIONS);
    expect(manifest.emotions).toEqual(EMOTIONS);
    expect(binary.byteLength).toBe(manifest.parameterCount * 4);
    expect(binary.byteLength).toBe(manifest.weightBytes);
    expect(binary.byteLength).toBeLessThan(100_000);
    expect(createHash('sha256').update(new Uint8Array(binary)).digest('hex')).toBe(manifest.sha256);
    expect(new Float32Array(binary).every(Number.isFinite)).toBe(true);
    expect(new Float32Array(binary).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(model.metadata.heldOutActionAccuracy).toBeGreaterThan(0.85);
    expect(model.metadata.heldOutEmotionAccuracy).toBeGreaterThan(0.85);
  });

  it('rejects unsupported versions, reordered features, invalid dimensions, and truncated weights', () => {
    expect(() => decodePolicy({ ...manifest, version: 999 }, binary)).toThrow(/版本|version/i);
    expect(() => decodePolicy({ ...manifest, observationSchemaVersion: 1 }, binary)).toThrow(/版本|schema/i);
    expect(() => decodePolicy({ ...manifest, featureNames: [...FEATURE_NAMES].reverse() }, binary)).toThrow(/特征|feature/i);
    expect(() => decodePolicy({ ...manifest, architecture: { ...manifest.architecture, input: 35 } }, binary)).toThrow(/维度|shape|dimension/i);
    expect(() => decodePolicy(manifest, binary.slice(0, -4))).toThrow(/大小|length|bytes/i);
    const broken = binary.slice(0);
    new Float32Array(broken)[0] = Number.NaN;
    expect(() => decodePolicy(manifest, broken)).toThrow(/有限|finite/i);
    const tensorMismatch = structuredClone(manifest);
    tensorMismatch.tensors[0].shape[0] -= 1;
    expect(() => decodePolicy(tensorMismatch, binary)).toThrow(/张量|tensor|shape/i);
  });

  it('loads only the bundled manifest and binary, and reports corrupt or missing assets', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === '/test-model/manifest.json') return new Response(JSON.stringify(manifest));
      if (String(url) === '/test-model/policy.f32') return new Response(binary.slice(0));
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const loaded = await loadPolicy('/test-model/');
    expect(loaded.metadata.weightBytes).toBe(binary.byteLength);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(loadPolicy('/missing/')).rejects.toThrow(/加载|404/);

    const changed = binary.slice(0);
    new Float32Array(changed)[0] += 0.5;
    fetchMock.mockImplementation(async url => String(url).endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(changed));
    await expect(loadPolicy('/test-model/')).rejects.toThrow(/校验|hash|checksum/i);
  });

  it('loads and still rejects tampered weights when crypto.subtle is unavailable (plain HTTP origins)', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === '/test-model/manifest.json') return new Response(JSON.stringify(manifest));
      if (String(url) === '/test-model/policy.f32') return new Response(binary.slice(0));
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint32Array) => array.fill(1) });
    const loaded = await loadPolicy('/test-model/');
    expect(loaded.metadata.weightBytes).toBe(binary.byteLength);

    const changed = binary.slice(0);
    new Float32Array(changed)[0] += 0.5;
    fetchMock.mockImplementation(async url => String(url).endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(changed));
    await expect(loadPolicy('/test-model/')).rejects.toThrow(/校验|hash|checksum/i);
  });
});

describe('pure-JS SHA-256 fallback for insecure contexts', () => {
  it('matches FIPS 180-4 test vectors and the shipped weights checksum', () => {
    const encode = new TextEncoder();
    expect(sha256HexFallback(encode.encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexFallback(encode.encode('')))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256HexFallback(encode.encode('The quick brown fox jumps over the lazy dog')))
      .toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
    expect(sha256HexFallback(new Uint8Array(binary))).toBe(manifest.sha256);
  });
});

describe('synchronous local inference', () => {
  it('matches independently exported NumPy logits, actions, and emotions', () => {
    for (const item of cases) {
      const result = inferPolicy(model, observe(item));
      expect(result.source).toBe('model');
      expect(result.action, item.name).toBe(item.action);
      expect(result.emotion, item.name).toBe(item.emotion);
      const logits = model.predict(item.features);
      item.actionLogits.forEach((value, index) => expect(Math.abs(logits.action[index] - value), `${item.name}: action ${index}`).toBeLessThan(0.0001));
      item.emotionLogits.forEach((value, index) => expect(Math.abs(logits.emotion[index] - value), `${item.name}: emotion ${index}`).toBeLessThan(0.0001));
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.latencyMs)).toBe(true);
    }
  });

  it('honors legal actions and never emits an unmasked action or non-finite score', () => {
    const item = cases.find(value => value.name === 'hungry')!;
    const observation = { ...observe(item), allowed: ['rest'] as ActionId[] };
    for (const result of [inferPolicy(model, observation), baselinePolicy(observation)]) {
      expect(result.action).toBe('rest');
      expect(result.scores).toHaveLength(ACTIONS.length);
      expect(result.scores.every(Number.isFinite)).toBe(true);
      expect(result.scores.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
      result.scores.forEach((value, index) => expect(value).toBe(index === ACTIONS.indexOf('rest') ? 1 : 0));
    }
  });

  it('responds to fatigue, hunger, danger, commands, and the final return window', () => {
    const expected: Record<string, ActionId> = {
      hungry: 'eat', fatigued: 'rest', danger: 'camp', commanded_wood: 'wood',
      commanded_rest: 'rest', exhausted_refusal: 'rest', late_return: 'camp',
    };
    for (const [name, action] of Object.entries(expected)) {
      const item = cases.find(value => value.name === name)!;
      expect(inferPolicy(model, observe(item)).action, name).toBe(action);
      expect(baselinePolicy(observe(item)).action, name).toBe(action);
    }
  });

  it('uses exactly the same teacher as training for the fair rules baseline', () => {
    for (const item of cases) {
      const result = baselinePolicy(observe(item));
      expect(result.source).toBe('rules');
      expect(result.action, item.name).toBe(item.teacherAction);
      expect(result.emotion, item.name).toBe(item.teacherEmotion);
      const scores = teacherScores(item.features);
      item.teacherActionScores.forEach((value, index) => expect(Math.abs(value - scores.action[index])).toBeLessThan(0.00001));
      item.teacherEmotionScores.forEach((value, index) => expect(Math.abs(value - scores.emotion[index])).toBeLessThan(0.00001));
    }
  });

  it('rejects malformed observations instead of pretending the model succeeded', () => {
    const observation = observe(cases[0]);
    for (const run of [(value: PolicyObservation) => inferPolicy(model, value), baselinePolicy]) {
      expect(() => run({ ...observation, features: [0, 1] })).toThrow(/特征|feature/i);
      expect(() => run({ ...observation, allowed: [] })).toThrow(/动作|action/i);
      expect(() => run({ ...observation, allowed: ['teleport' as ActionId] })).toThrow(/动作|action/i);
      const values = [...observation.features];
      values[0] = Number.NaN;
      expect(() => run({ ...observation, features: values })).toThrow(/有限|finite/i);
      values[0] = 1.5;
      expect(() => run({ ...observation, features: values })).toThrow(/范围|range/i);
    }
    expect(() => inferPolicy({ ...model, predict: () => ({ action: [0], emotion: Array(5).fill(0) }) }, observation)).toThrow(/shape/);
    expect(() => inferPolicy({ ...model, predict: () => ({ action: Array(8).fill(Infinity), emotion: Array(5).fill(0) }) }, observation)).toThrow(/finite/);
  });
});
