import { ACTIONS, EMOTIONS } from '../game/types';
import type { ActionId, Emotion, PolicyObservation, PolicyResult } from '../game/types';
import { FEATURE_NAMES, FEATURE_VERSION } from '../game/observation';
import { teacherScores } from './teacher';
import { sha256Hex } from './sha256';

interface EvaluationMetrics {
  samples: number;
  actionAccuracy: number;
  emotionAccuracy: number;
  [key: string]: unknown;
}

export interface PolicyManifest {
  version: 1;
  observationSchemaVersion: 2;
  format: 'campmind-f32-mlp';
  name: string;
  kind: 'supervised-mlp';
  dtype: 'float32-le';
  featureNames: string[];
  actions: ActionId[];
  emotions: Emotion[];
  architecture: { input: number; hidden: [number, number]; action: number; emotion: number; activation: 'relu' };
  tensors: Array<{ name: string; shape: number[]; offset: number; length: number }>;
  parameterCount: number;
  weightBytes: number;
  weightsFile: string;
  sha256: string;
  training: { seed: number; [key: string]: unknown };
  metrics: { heldOut: EvaluationMetrics; shifted: EvaluationMetrics; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PolicyMetadata {
  name: string;
  kind: 'supervised-mlp';
  version: number;
  observationSchemaVersion: number;
  parameterCount: number;
  weightBytes: number;
  heldOutActionAccuracy: number;
  heldOutEmotionAccuracy: number;
  stressActionAccuracy: number;
  stressEmotionAccuracy: number;
  trainingSeed: number;
}

export interface LoadedPolicy {
  readonly metadata: PolicyMetadata;
  readonly manifest: PolicyManifest;
  /** Exposed for reproducible NumPy/JavaScript parity checks and local diagnostics. */
  readonly predict: (features: readonly number[]) => { action: number[]; emotion: number[] };
}

function fail(message: string): never { throw new Error(`策略模型：${message}`); }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const sameArray = (value: unknown, expected: readonly unknown[]) => Array.isArray(value)
  && value.length === expected.length && value.every((item, index) => item === expected[index]);

function validateManifest(value: unknown): PolicyManifest {
  if (!record(value)) fail('manifest 格式无效');
  if (value.version !== 1) fail('不支持的模型版本 version');
  if (value.observationSchemaVersion !== FEATURE_VERSION) fail('不支持的观测版本 schema');
  if (value.format !== 'campmind-f32-mlp' || value.kind !== 'supervised-mlp' || value.dtype !== 'float32-le') fail('模型格式或精度无效');
  if (!sameArray(value.featureNames, FEATURE_NAMES)) fail('输入特征 feature 顺序不匹配');
  if (!sameArray(value.actions, ACTIONS) || !sameArray(value.emotions, EMOTIONS)) fail('输出类别顺序不匹配');
  if (typeof value.name !== 'string' || !value.name.length || value.name.length > 120) fail('模型名称无效');
  const architecture = value.architecture;
  if (!record(architecture) || architecture.input !== FEATURE_NAMES.length || architecture.action !== ACTIONS.length
    || architecture.emotion !== EMOTIONS.length || architecture.activation !== 'relu'
    || !Array.isArray(architecture.hidden) || architecture.hidden.length !== 2
    || !architecture.hidden.every(size => Number.isInteger(size) && size > 0 && size <= 256)) fail('网络维度 shape 无效');
  const [h1, h2] = architecture.hidden as number[];
  const expected = [
    ['hidden1.weight', [FEATURE_NAMES.length, h1]], ['hidden1.bias', [h1]],
    ['hidden2.weight', [h1, h2]], ['hidden2.bias', [h2]],
    ['action.weight', [h2, ACTIONS.length]], ['action.bias', [ACTIONS.length]],
    ['emotion.weight', [h2, EMOTIONS.length]], ['emotion.bias', [EMOTIONS.length]],
  ] as const;
  if (!Array.isArray(value.tensors) || value.tensors.length !== expected.length) fail('张量 tensor 数量无效');
  let offset = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const tensor = value.tensors[index];
    const [name, shape] = expected[index];
    const length = shape.reduce((total, size) => total * size, 1);
    if (!record(tensor) || tensor.name !== name || !sameArray(tensor.shape, shape)
      || tensor.offset !== offset || tensor.length !== length) fail(`张量 tensor ${name} 的形状或偏移无效`);
    offset += length;
  }
  if (value.parameterCount !== offset || value.weightBytes !== offset * 4) fail('权重大小 bytes 与参数数量不符');
  if (typeof value.weightsFile !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.f32$/.test(value.weightsFile)) fail('权重文件名无效');
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) fail('权重校验 hash 无效');
  if (!record(value.training) || !Number.isSafeInteger(value.training.seed)) fail('训练信息无效');
  if (!record(value.metrics)) fail('评估信息缺失');
  for (const split of ['heldOut', 'shifted']) {
    const metric = value.metrics[split];
    if (!record(metric) || !Number.isSafeInteger(metric.samples) || Number(metric.samples) <= 0) fail('评估样本数量无效');
    for (const name of ['actionAccuracy', 'emotionAccuracy']) {
      const score = metric[name];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) fail('评估准确率无效');
    }
  }
  return value as unknown as PolicyManifest;
}

function validateFeatures(features: readonly number[]): void {
  if (!Array.isArray(features) || features.length !== FEATURE_NAMES.length) fail(`需要 ${FEATURE_NAMES.length} 个输入特征 feature`);
  for (const value of features) {
    if (!Number.isFinite(value)) fail('输入特征必须为有限 finite 数值');
    if (value < 0 || value > 1) fail('输入特征超出 [0, 1] 范围 range');
  }
}

function validateObservation(observation: PolicyObservation): void {
  if (!observation || !Array.isArray(observation.features)) fail('缺少输入特征 feature');
  validateFeatures(observation.features);
  if (!Array.isArray(observation.allowed) || observation.allowed.length === 0
    || observation.allowed.some(action => !ACTIONS.includes(action))) fail('合法动作 action 列表为空或包含未知动作');
}

function dense(input: ArrayLike<number>, weight: Float32Array, bias: Float32Array, relu = false): Float32Array {
  const output = new Float32Array(bias.length);
  for (let column = 0; column < output.length; column += 1) {
    let value = bias[column];
    for (let row = 0; row < input.length; row += 1) value += input[row] * weight[row * output.length + column];
    if (!Number.isFinite(value)) fail('网络输出不是有限 finite 数值');
    output[column] = relu ? Math.max(0, value) : value;
    if (!Number.isFinite(output[column])) fail('网络输出溢出 finite 范围');
  }
  return output;
}

/** Decode trusted local bytes synchronously. loadPolicy additionally verifies SHA-256. */
export function decodePolicy(value: unknown, binary: ArrayBuffer): LoadedPolicy {
  const manifest = validateManifest(value);
  if (!(binary instanceof ArrayBuffer) || binary.byteLength !== manifest.weightBytes) fail('权重文件大小 bytes 不匹配');
  const view = new DataView(binary);
  const weights = new Float32Array(manifest.parameterCount);
  for (let index = 0; index < weights.length; index += 1) {
    weights[index] = view.getFloat32(index * 4, true);
    if (!Number.isFinite(weights[index])) fail('权重必须为有限 finite 数值');
  }
  const tensors = manifest.tensors.map(tensor => weights.subarray(tensor.offset, tensor.offset + tensor.length));
  const metadata: PolicyMetadata = Object.freeze({
    name: manifest.name, kind: manifest.kind, version: manifest.version, observationSchemaVersion: manifest.observationSchemaVersion,
    parameterCount: manifest.parameterCount, weightBytes: manifest.weightBytes,
    heldOutActionAccuracy: manifest.metrics.heldOut.actionAccuracy,
    heldOutEmotionAccuracy: manifest.metrics.heldOut.emotionAccuracy,
    stressActionAccuracy: manifest.metrics.shifted.actionAccuracy,
    stressEmotionAccuracy: manifest.metrics.shifted.emotionAccuracy,
    trainingSeed: manifest.training.seed,
  });
  return Object.freeze({
    metadata, manifest,
    predict(features: readonly number[]) {
      validateFeatures(features);
      const h1 = dense(new Float32Array(features), tensors[0], tensors[1], true);
      const h2 = dense(h1, tensors[2], tensors[3], true);
      return { action: Array.from(dense(h2, tensors[4], tensors[5])), emotion: Array.from(dense(h2, tensors[6], tensors[7])) };
    },
  });
}

/** Loads static files only; no remote inference or runtime model download service. */
export async function loadPolicy(baseUrl?: string): Promise<LoadedPolicy> {
  const base = baseUrl ?? `${import.meta.env?.BASE_URL ?? './'}models/`;
  const directory = base.endsWith('/') ? base : `${base}/`;
  try {
    const manifestResponse = await fetch(`${directory}manifest.json`);
    if (!manifestResponse.ok) fail(`manifest 加载失败 ${manifestResponse.status}`);
    const manifest = validateManifest(await manifestResponse.json());
    const weightResponse = await fetch(`${directory}${manifest.weightsFile}`);
    if (!weightResponse.ok) fail(`权重加载失败 ${weightResponse.status}`);
    const binary = await weightResponse.arrayBuffer();
    const model = decodePolicy(manifest, binary);
    const actual = await sha256Hex(binary);
    if (actual !== manifest.sha256) fail('权重 SHA-256 校验 checksum 失败');
    return model;
  } catch (error) {
    throw new Error(`本地策略加载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function resultFromScores(
  logits: { action: readonly number[]; emotion: readonly number[] },
  observation: PolicyObservation,
  source: 'model' | 'rules',
  started: number,
): PolicyResult {
  if (logits.action.length !== ACTIONS.length || logits.emotion.length !== EMOTIONS.length
    || !logits.action.every(Number.isFinite) || !logits.emotion.every(Number.isFinite)) fail('策略输出 shape 或 finite 数值无效');
  const allowed = new Set(observation.allowed);
  let selected = -1;
  for (let index = 0; index < ACTIONS.length; index += 1) {
    if (allowed.has(ACTIONS[index]) && (selected < 0 || logits.action[index] > logits.action[selected])) selected = index;
  }
  if (selected < 0) fail('没有可执行动作 action');
  const scores = logits.action.map((value, index) => allowed.has(ACTIONS[index]) ? Math.exp(value - logits.action[selected]) : 0);
  const total = scores.reduce((sum, score) => sum + score, 0);
  const normalized = scores.map(score => score / total);
  let emotion = 0;
  for (let index = 1; index < EMOTIONS.length; index += 1) if (logits.emotion[index] > logits.emotion[emotion]) emotion = index;
  return { action: ACTIONS[selected], emotion: EMOTIONS[emotion], scores: normalized, source, latencyMs: performance.now() - started };
}

export function inferPolicy(model: LoadedPolicy, observation: PolicyObservation): PolicyResult {
  const started = performance.now();
  validateObservation(observation);
  return resultFromScores(model.predict(observation.features), observation, 'model', started);
}

export function baselinePolicy(observation: PolicyObservation): PolicyResult {
  const started = performance.now();
  validateObservation(observation);
  return resultFromScores(teacherScores(observation.features), observation, 'rules', started);
}
