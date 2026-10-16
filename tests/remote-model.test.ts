import { afterEach, expect, it, vi } from 'vitest';
import { RemoteModels, RemoteRuntime } from '../src/integrations/models/remote';
import { remoteEndpoint } from '../src/shared/remote-model';
vi.mock('../src/integrations/world/session', () => ({ ensurePlayerSession: async () => {} }));
afterEach(() => vi.unstubAllGlobals());
const config = { id: 'remote-test', name: '测试', baseUrl: 'https://provider.example/v1', model: 'small' };
it('loads and saves public metadata through the current-player database API', async () => {
  const request = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ models: [{ ...config, requiresKey: true, hasKey: true }] }));
  vi.stubGlobal('fetch', request);
  const models = new RemoteModels(); await models.save(config, 'fake-private-key');
  expect(request.mock.calls[0][0]).toBe('/game-api/remote-models');
  expect(JSON.parse(String(request.mock.calls[0][1].body)).apiKey).toBe('fake-private-key');
  expect(JSON.stringify(models.list())).not.toContain('fake-private-key');
  const refreshed = new RemoteModels(); await refreshed.refresh();
  expect(refreshed.list()[0]).toMatchObject({ hasKey: true, requiresKey: true });
  await refreshed.save(config); expect(JSON.parse(String(request.mock.calls[2][1].body))).not.toHaveProperty('apiKey');
});
it('normalizes compatible URLs and rejects credentials/query/non-http URLs', () => {
  expect(remoteEndpoint('https://provider.example/v1/')).toBe('https://provider.example/v1/chat/completions');
  for (const url of ['file:///etc/passwd', 'https://user:secret@example.com', 'https://example.com/?key=secret']) expect(() => remoteEndpoint(url)).toThrow();
});
it('generation sends only an ID and prompt, resolving saved credentials on the server', async () => {
  const request = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ content: '我们一起商量吧。', latencyMs: 20 })); vi.stubGlobal('fetch', request);
  const runtime = new RemoteRuntime('remote-test', new RemoteModels());
  await runtime.prepare(() => {}, new AbortController().signal);
  const result = await runtime.generate({ requestId: 'r', prompt: '你好' } as never, new AbortController().signal);
  expect(result.source).toBe('remote:remote-test'); expect(result.text).toBe('我们一起商量吧。');
  expect(request.mock.calls[1][0]).toBe('/game-api/remote-models/generate');
  expect(JSON.parse(String(request.mock.calls[1][1].body))).toEqual({ id: 'remote-test', prompt: '你好', test: false });
});
