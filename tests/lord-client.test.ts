import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldClient } from '../src/integrations/world/client';
import type { WorldSnapshot } from '../src/integrations/world/types';
import { createGame } from '../src/games/camp/simulation/engine';

const empty: WorldSnapshot = { state: { ...createGame({ mode: 'rules' }), status: 'playing' }, revision: 0, speed: 1, savedAt: 0, recovered: false, temporaryPause: false, catchingUp: false };
const json = (revision = 0) => new Response(JSON.stringify({ ...empty, revision }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
type Sent = { revision: number; operation: string; action: { type: string; command?: { direction?: { x: number; y: number } }; paused?: boolean } };
const clients: WorldClient[] = [];

async function fixture() {
  const sent: Sent[] = [];
  let release: (() => void) | undefined;
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (!init.body) return json(sent.length);
    const request = JSON.parse(init.body) as Sent;
    sent.push(request);
    if (sent.length === 1) await new Promise<void>(resolve => { release = resolve; });
    return json(request.revision + 1);
  }));
  const client = new WorldClient(() => {}, () => {}); clients.push(client);
  await client.poll();
  return { client, sent, release: () => { expect(release).toBeTypeOf('function'); release!(); } };
}

afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lord movement transport', () => {
  it('keeps one in-flight input and sends only the latest stop after a heartbeat burst', async () => {
    const f = await fixture();
    f.client.sendLordInput({ x: 1, y: 0 }); await flush();
    for (let i = 0; i < 100; i++) f.client.sendLordInput({ x: i % 2, y: 1 });
    f.client.sendLordInput({ x: 0, y: 0 }); await flush();
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].action.command?.direction).toEqual({ x: 1, y: 0 });
    f.release(); await flush();
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1].action.command?.direction).toEqual({ x: 0, y: 0 });
    expect(f.sent.map(request => request.revision)).toEqual([0, 1]);
  });

  it('invalidates a pending held direction when an ordinary pause is requested', async () => {
    const f = await fixture();
    f.client.sendLordInput({ x: 1, y: 0 }); await flush();
    f.client.sendLordInput({ x: 0, y: 1 });
    const paused = f.client.mutate({ type: 'pause', paused: true });
    f.release(); await paused; await flush();
    expect(f.sent.some(request => request.action.type === 'pause')).toBe(true);
    expect(f.sent.slice(1).filter(request => request.action.type === 'command')
      .every(request => request.action.command?.direction?.x === 0 && request.action.command?.direction?.y === 0)).toBe(true);
  });

  it('turns a queued direction older than 300 ms into a stop before dispatch', async () => {
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const f = await fixture();
    f.client.sendLordInput({ x: 1, y: 0 }); await flush();
    f.client.sendLordInput({ x: 0, y: 1 });
    now += 301;
    f.release(); await flush();
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1].action.command?.direction).toEqual({ x: 0, y: 0 });
  });

  it('does not retry a motion renewal after a transport failure', async () => {
    const sent: Sent[] = [];
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (!init.body) return json();
      sent.push(JSON.parse(init.body));
      throw new TypeError('response lost');
    }));
    const client = new WorldClient(() => {}, () => {}); clients.push(client); await client.poll();
    client.sendLordInput({ x: 1, y: 0 }); await flush();
    expect(sent).toHaveLength(1);
  });

  it('refreshes the committed revision after a lost response without replaying old movement', async () => {
    const sent: Sent[] = [];
    let revision = 0;
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (!init.body) return json(revision);
      const request = JSON.parse(init.body) as Sent; sent.push(request);
      if (request.revision !== revision) return new Response(JSON.stringify({ error: 'revision conflict' }), { status: 409 });
      revision++;
      if (sent.length === 1) throw new TypeError('response lost after commit');
      return json(revision);
    }));
    const client = new WorldClient(() => {}, () => {}); clients.push(client); await client.poll();
    client.sendLordInput({ x: 1, y: 0 }); await flush();
    client.sendLordInput({ x: 0, y: 0 }); await flush();
    expect(sent.map(request => request.revision)).toEqual([0, 1]);
    expect(client.snapshot.revision).toBe(2);
  });
});
