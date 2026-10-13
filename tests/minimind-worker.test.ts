import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialoguePayload } from '../packages/npc-dialogue/src/types';
import type { ModelCommand, ModelMessage } from '../src/integrations/minimind/protocol';

vi.mock('@wllama/wllama/esm/index.js', () => ({ Wllama: class {
  setCompat() {} async loadModel() {}
  async createCompletion(options: { onData(chunk: { choices: { text: string }[] }): void }) {
    options.onData({ choices: [{ text: '现在我先歇一会儿。' }] });
  }
} }));
vi.mock('@wllama/wllama-compat/wasm/wllama.js?raw', () => ({ default: '' }));
vi.mock('../src/integrations/minimind/assets', () => ({ MINIMIND_ASSET: { file: 'model.gguf' },
  browserModelStore: () => ({}), loadVerifiedModel: async () => ({ blob: new Blob(['model']), cached: true, persistent: false }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('worker 无效请求不占住模型槽', () => {
  it('缺少提示词失败后，下一次合法生成仍能执行', async () => {
    const messages: ModelMessage[] = [];
    vi.stubGlobal('postMessage', (message: ModelMessage) => messages.push(message));
    vi.stubGlobal('onmessage', undefined);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ available: true })));
    await import('../src/integrations/minimind/worker');
    const handle = globalThis.onmessage as unknown as (event: { data: ModelCommand }) => Promise<void>;
    await handle({ data: { id: 1, type: 'prepare', base: '/' } });
    await handle({ data: { id: 2, type: 'generate', payload: { requestId: 'bad' } as DialoguePayload } });
    expect(messages.at(-1)).toMatchObject({ id: 2, type: 'error', error: '缺少宿主构建的提示词' });
    await handle({ data: { id: 3, type: 'generate', payload: { requestId: 'good', prompt: '完整提示词' } as DialoguePayload } });
    expect(messages.at(-1)).toMatchObject({ id: 3, type: 'result', value: { requestId: 'good', text: '现在我先歇一会儿。' } });
  });
});
