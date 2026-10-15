import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type RequestListener } from 'node:http';
import { nativeModelsPlugin } from '../scripts/native-models/plugin';

let handler: RequestListener;
const server = createServer((req, res) => handler(req, res)); let base = '';
beforeAll(async () => {
  const install = nativeModelsPlugin().configureServer as (server: unknown) => void;
  install({ config: { root: process.cwd() }, httpServer: server, middlewares: { use: (middleware: (req: unknown, res: unknown, next: () => void) => void) => {
    handler = (req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); });
  } } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
it('the real same-origin HTTP bridge rejects foreign origins, private destinations and malformed JSON without exposing keys', async () => {
  const data = { config: { id: 'remote-local', name: '测试', model: 'small', baseUrl: 'http://127.0.0.1:18080/v1' }, apiKey: 'fake-session-key', prompt: '你好' };
  const post = (body: string, origin = base) => fetch(`${base}/model-api/remote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Campmind-Request': '1', Origin: origin }, body });
  expect((await post(JSON.stringify(data), 'https://foreign.example')).status).toBe(403);
  const denied = await post(JSON.stringify(data)); expect(denied.status).toBe(400); expect(await denied.json()).toEqual({ error: '远程接口必须使用公网地址' });
  const malformed = await post('{"apiKey":"fake-session-key",'); expect(malformed.status).toBe(400); expect(await malformed.json()).toEqual({ error: '请求 JSON 无效' });
});
