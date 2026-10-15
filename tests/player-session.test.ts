import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => vi.unstubAllGlobals());
it('shares first-open identity establishment across concurrent consumers and retries failed establishment', async () => {
  vi.resetModules();
  let finish!: (response: Response) => void;
  const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', request);
  const { ensurePlayerSession } = await import('../src/integrations/world/session');
  const world = ensurePlayerSession(), models = ensurePlayerSession();
  expect(world).toBe(models); expect(request).toHaveBeenCalledOnce();
  finish(new Response('', { status: 503 }));
  await expect(world).rejects.toThrow('会话');
  const retry = ensurePlayerSession(); expect(request).toHaveBeenCalledTimes(2);
  finish(Response.json({ ok: true })); await retry;
  await ensurePlayerSession(); expect(request).toHaveBeenCalledTimes(2);
});
