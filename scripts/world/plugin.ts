import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export function persistentWorldPlugin(): Plugin {
  const port = Number(process.env.CAMP_WORLD_PORT ?? 18081);
  let root = '';
  const ensure = async () => {
    // The unified launcher already owns and health-checks its child before Vite starts.
    // A second 500ms probe can time out while existing worlds catch up, despite a live child.
    // Child exit is supervised by the launcher; this plugin must neither reject nor respawn it.
    if (process.env.CAMP_WORLD_MANAGED === '1') return;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/game-api/health`, { signal: AbortSignal.timeout(500) });
      const health = await response.json();
      if (health.service !== 'campmind-world-v1' || path.resolve(health.root) !== root) throw new Error('存档服务端口被其他项目占用');
      return;
    } catch (error) {
      if (error instanceof Error && error.message.includes('被其他项目')) throw error;
    }
    mkdirSync(path.join(root, 'data'), { recursive: true });
    const log = openSync(path.join(root, 'data/world-service.log'), 'a');
    try {
      // Node's native Windows watch restarts can create visible console children
      // even when the initial parent has windowsHide. Keep the durable service
      // hidden; Windows backend source updates require an explicit restart.
      const watchArgs=process.platform==='win32'?[]:['--watch','--watch-preserve-output'];
      const child = spawn(process.execPath, [...watchArgs, '--import', 'tsx', 'scripts/world/server.ts'], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env,
      });
      child.unref();
    } finally { closeSync(log); }
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        const response = await fetch(`http://127.0.0.1:${port}/game-api/health`, { signal: AbortSignal.timeout(500) });
        const health = await response.json();
        if (health.service === 'campmind-world-v1' && path.resolve(health.root) === root) return;
      } catch { /* startup still in progress */ }
    }
    throw new Error('存档服务启动失败，详见 data/world-service.log');
  };
  return {
    name: 'campmind-persistent-world',
    config: () => {
      const proxy = { '/game-api': { target: `http://127.0.0.1:${port}`, xfwd: true } };
      return { server: { proxy }, preview: { proxy } };
    },
    configResolved: config => { root = path.resolve(config.root); },
    configureServer: async () => { await ensure(); },
    configurePreviewServer: async () => { await ensure(); },
  };
}
