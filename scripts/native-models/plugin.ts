import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NativeModelHost } from './host';
import { checkOrigin } from './validation';
import { remoteCompletion } from './remote';

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 40000) throw new Error('请求过大');
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('请求 JSON 无效'); }
}
export function nativeModelsPlugin(): Plugin {
  let host: NativeModelHost | undefined;
  function install(server: { config: { root: string }; middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }; httpServer?: { once: (name: string, cb: () => void) => unknown } | null }) {
    const runtime = host ??= new NativeModelHost(server.config.root);
    process.once('exit', () => runtime.dispose());
    server.httpServer?.once('close', () => runtime.dispose());
    server.middlewares.use((req, res, next) => {
      const route = (req.url ?? '').split('?')[0]; if (!route.startsWith('/model-api/')) { next(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      const reply = (code: number, data: unknown) => { if (!res.destroyed) { res.statusCode = code; res.end(JSON.stringify(data)); } };
      const controller = new AbortController(); res.once('close', () => { if (!res.writableEnded) controller.abort(); });
      void (async () => {
        if (req.method === 'GET' && route === '/model-api/models') {
          const models = await runtime.catalog(); reply(200, { models: models.map(({ id, name, available, bytes, threads, context }) => ({ id, name, backend: 'native', available, bytes, threads, context })) }); return;
        }
        if (req.method === 'GET' && route === '/model-api/status') { reply(200, runtime.snapshot()); return; }
        if (req.method !== 'POST' || !checkOrigin(req.headers)) { reply(403, { error: '只允许游戏同源请求' }); return; }
        const data = await body(req);
        if (route === '/model-api/remote') { reply(200, await remoteCompletion(data, controller.signal)); return; }
        if (typeof data.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(data.id)) throw new Error('模型 ID 无效');
        if (route === '/model-api/select' || route === '/model-api/unload') {
          if (typeof data.token !== 'string' || !/^[a-z0-9-]{36}$/i.test(data.token)) throw new Error('模型操作归属无效');
        }
        if (route === '/model-api/select') { reply(200, await runtime.select(data.id, data.token)); return; }
        if (route === '/model-api/unload') { await runtime.unload(data.id, data.operation, data.token); reply(200, { ok: true }); return; }
        if (route === '/model-api/generate') {
          if (typeof data.prompt !== 'string' || data.prompt.length > 8000 || !Number.isInteger(data.operation)) throw new Error('对话请求无效');
          reply(200, await runtime.generate(data.id, data.operation, data.prompt, controller.signal)); return;
        }
        reply(404, { error: '接口不存在' });
      })().catch(error => reply(error?.outcome === 'busy' ? 409 : 400, { error: error instanceof Error ? error.message : '原生模型服务异常', ...(error?.outcome ? { outcome: error.outcome } : {}) }));
    });
  }
  return { name: 'campmind-native-models', configureServer: install, configurePreviewServer: install, closeBundle: () => host?.dispose() };
}
