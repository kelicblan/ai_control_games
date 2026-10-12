import { Wllama } from '@wllama/wllama/esm/index.js';
import compatWorker from '@wllama/wllama-compat/wasm/wllama.js?raw';
import { MINIMIND_ASSET, browserModelStore, loadVerifiedModel } from './minimind-assets';
import { buildCaptionPrompt, captionPrefix, cleanCaption } from './minimind-prompt';
import type { ModelCommand, ModelMessage } from './minimind-protocol';

const send = (message: ModelMessage) => postMessage(message);
let engine: Wllama | undefined;
let active: { id: number; controller: AbortController; cancelled: boolean } | undefined;
let loading: Promise<void> | undefined;

onmessage = async ({ data }: MessageEvent<ModelCommand>) => {
  if (data.type === 'cancel') {
    if (active?.id === data.id) { active.cancelled = true; active.controller.abort(); } return;
  }
  try {
    if (data.type === 'prepare') {
      if (!loading) loading = (async () => {
        const manifest = await fetch(`${data.base}minimind/model.json`, { cache: 'no-store' });
        if (!manifest.ok || (await manifest.json()).available !== true) {
          throw new Error('暂时没有可用的台词模型，伙伴照常行动。');
        }
        const url = `${data.base}minimind/${MINIMIND_ASSET.file}`;
        let lastProgress = -1; let lastStage = '';
        const model = await loadVerifiedModel({ ...MINIMIND_ASSET, url }, browserModelStore(url), fetch,
          value => {
            if (value.stage !== lastStage || value.progress - lastProgress >= .01 || value.progress === 1) {
              lastProgress = value.progress; lastStage = value.stage;
              send({ id: data.id, type: 'progress', value });
            }
          });
        send({ id: data.id, type: 'progress', value: { stage: 'load', progress: 1,
          cached: model.cached, persistent: model.persistent } });
        const instance = new Wllama({ default: `${data.base}minimind/wllama.wasm` }, {
          suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error() {} },
        });
        instance.setCompat({ wasm: `${data.base}minimind/compat.wasm`, worker: { code: compatWorker } }, 'firefox_safari');
        await instance.loadModel([model.blob], { n_ctx: 1024, n_batch: 128, n_ubatch: 128,
          n_threads: 1, n_gpu_layers: 0, n_parallel: 1, cache_idle_slots: false, n_cache_reuse: 0,
          warmup: false, ctx_shift: false });
        engine = instance;
        send({ id: data.id, type: 'progress', value: { stage: 'ready', progress: 1,
          cached: model.cached, persistent: model.persistent } });
      })();
      await loading;
      send({ id: data.id, type: 'result' });
      return;
    }
    if (!engine) throw new Error('模型未加载');
    if (active) { send({ id: data.id, type: 'error', error: '模型忙', outcome: 'busy' }); return; }
    const controller = new AbortController(); active = { id: data.id, controller, cancelled: false };
    const started = performance.now(); const prefix = captionPrefix(data.payload);
    let continuation = ''; let complete = false;
    try {
      // Each raw request is a fresh, complete ChatML prompt. Never append another NPC's history.
      // cache_prompt=false prevents slot KV reuse even for matching prefixes.
      try { await engine.createCompletion({ prompt: buildCaptionPrompt(data.payload, prefix),
        max_tokens: 64, temperature: .7, top_p: .9, seed: Math.floor(Math.random() * 2147483647),
        stop: ['<|im_end|>'], abortSignal: controller.signal,
        stream: true, onData(chunk) {
          continuation += chunk.choices[0]?.text ?? '';
          if (/[。！？!?]/.test(continuation)) { complete = true; controller.abort(); }
        },
        ...{ cache_prompt: false },
      }); } catch (error) { if (!complete || active?.cancelled) throw error; }
      if (active?.cancelled) throw new DOMException('Aborted', 'AbortError');
      const raw = prefix + continuation;
      const text = cleanCaption(raw, data.payload);
      if (continuation.trim().length < 3 || !text) {
        send({ id: data.id, type: 'error', error: '保留即时反馈', outcome: 'skipped' }); return;
      }
      send({ id: data.id, type: 'result', value: { requestId: data.payload.requestId,
        text, source: 'minimind3', latencyMs: performance.now() - started } });
    } finally { active = undefined; }
  } catch (error) {
    send({ id: data.id, type: 'error', error: error instanceof Error ? error.message : 'WASM 推理失败' });
  }
};
