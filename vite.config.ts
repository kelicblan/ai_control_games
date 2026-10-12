import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const npcProxy: Record<string, ProxyOptions> = { '/npc-api': { target: 'http://127.0.0.1:8765',
  rewrite: (path: string) => path.replace(/^\/npc-api/, ''),
  timeout: 4000, proxyTimeout: 4000,
  configure(proxy) {
    proxy.on('error', (_error, _request, response) => {
      if ('writeHead' in response && !response.headersSent && !response.writableEnded) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ready: false, unavailable: true, model: 'minimind-3-q8' }));
      }
    });
  } } };

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
  preview: { proxy: npcProxy },
  server: {
    proxy: npcProxy,
    host: '0.0.0.0',
    // 允许 nat100.top 的内网穿透子域名访问（如 aigames.nat100.top）
    allowedHosts: ['.nat100.top'],
  },
});
