import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldClient } from '../src/integrations/world/client';
import { createGame } from '../src/games/camp/simulation/engine';
import { SAVE_KEY } from '../src/games/camp/simulation/persistence';
import type { WorldSnapshot } from '../src/integrations/world/types';

const empty: WorldSnapshot = { state: null, revision: 0, speed: 1, savedAt: 0, recovered: false, temporaryPause: false, catchingUp: false };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('world client', () => {
  it('preserves the service rejection reason when legacy import fails', async () => {
    const state = createGame({ mode: 'rules' });
    const reports: string[] = [];
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, state }) });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => init.body
      ? json({ error: '初始进度校验失败' }, 503) : json(empty)));
    const client = new WorldClient(() => {}, message => reports.push(message));
    await client.poll();
    expect(reports.some(message => message.includes('初始进度校验失败'))).toBe(true);
    expect(client.snapshot.state).toBeNull();
    client.dispose();
  });
  it('serializes revisions and retries the same operation ID after transport loss', async () => {
    const operations: Array<{ revision: number; operation: string }> = [];
    let lost = false;
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (!init.body) return json(empty);
      const body = JSON.parse(init.body); operations.push(body);
      if (!lost) { lost = true; throw new TypeError('response lost'); }
      return json({ ...empty, revision: body.revision + 1 });
    }));
    const client = new WorldClient(() => {}, () => {}); await client.poll();
    await Promise.all([client.mutate({ type: 'speed', speed: 2 }), client.mutate({ type: 'speed', speed: 4 })]);
    expect(operations.map(item => item.revision)).toEqual([0, 0, 1]);
    expect(operations[0].operation).toBe(operations[1].operation);
    expect(operations[2].operation).not.toBe(operations[1].operation); client.dispose();
  });
  it('migrates a valid legacy save without removing its source', async () => {
    const remove = vi.fn(); const state = { ...createGame({ mode: 'rules' }), status: 'playing' };
    const imported: unknown[] = [];
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === SAVE_KEY ? JSON.stringify({ version: 1, state }) : null, removeItem: remove });
    let migrated = false;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init.body) { imported.push(JSON.parse(init.body)); migrated = true; }
      return json(migrated ? { ...empty, state, revision: 1 } : empty);
    }));
    const client = new WorldClient(() => {}, () => {}); await client.poll();
    expect(imported).toHaveLength(1); expect(remove).not.toHaveBeenCalled(); expect(client.snapshot.state?.status).toBe('playing'); client.dispose();
  });
  it('retains invalid legacy bytes and reports database failures', async () => {
    const remove = vi.fn(); const reports: string[] = [];
    vi.stubGlobal('localStorage', { getItem: () => '{broken', removeItem: remove });
    vi.stubGlobal('fetch', vi.fn(async () => json(empty)));
    const client = new WorldClient(() => {}, message => reports.push(message)); await client.poll();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'database is full' }, 503)));
    await expect(client.mutate({ type: 'speed', speed: 2 })).rejects.toThrow('database is full');
    await client.poll(); await Promise.resolve();
    expect(remove).not.toHaveBeenCalled(); expect(reports.some(message => message.includes('database is full'))).toBe(true); client.dispose();
  });
});
