import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NativeModelHost } from '../scripts/native-models/host';
import { resolveModelPath, checkOrigin, parseRouterEvent, verifyModel } from '../scripts/native-models/validation';
describe('native model host boundaries', () => {
  it('uses a completed thinking prefix and JSON schema without truncating cognition at punctuation',async()=>{
    const host=new NativeModelHost(process.cwd());
    Object.assign(host,{port:1234,state:{id:'qwen3-4b',operation:3,stage:'ready'}});
    const raw='{"summary":"很累。希望休息。"}';
    const request=vi.fn(async()=>new Response(JSON.stringify({content:raw}),{headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',request);
    try{
      expect((await host.appraise('qwen3-4b',3,'记忆数据',{type:'object'},new AbortController().signal)).content).toBe(raw);
      const [url,options]=request.mock.calls[0] as unknown as [string,RequestInit];
      const body=JSON.parse(options.body as string);
      expect(url).toContain('/completion');expect(body.json_schema).toEqual({type:'object'});
      expect(body.prompt).toContain('</think>');expect(body.stream).toBe(false);
    }finally{vi.unstubAllGlobals();host.dispose();}
  });
  it('rejects traversal and absolute paths outside the project', async () => {
    await expect(resolveModelPath(process.cwd(), '../outside.gguf')).rejects.toThrow();
    await expect(resolveModelPath(process.cwd(), 'C:/Windows/system32/file.gguf')).rejects.toThrow();
  });
  it('only accepts same-origin mutations with the app request header', () => {
    expect(checkOrigin({ host: 'localhost:5173', origin: 'http://evil.example', 'x-campmind-request': '1' })).toBe(false);
    expect(checkOrigin({ host: 'localhost:5173', origin: 'http://localhost:5173' })).toBe(false);
    expect(checkOrigin({ host: 'localhost:5173', origin: 'http://localhost:5173', 'x-campmind-request': '1' })).toBe(true);
  });
  it('uses the actual native loading fraction and ignores unrelated model events', () => {
    const event = { model: 'qwen08', event: 'model_status', data: { status: 'loading', progress: { current: 'text_model', value: .37 } } };
    expect(parseRouterEvent(event, 'qwen08')).toEqual({ stage: 'load', progress: .37 });
    expect(parseRouterEvent(event, 'other')).toBe(null);
    expect(parseRouterEvent({ ...event, data: { status: 'loaded' } }, 'qwen08')).toEqual({ stage: 'ready', progress: 1 });
  });
  it('unknown model IDs cannot start the native router', async () => {
    const host = new NativeModelHost(process.cwd());
    await expect(host.select('not-registered')).rejects.toThrow('未知模型');
    expect(host.snapshot().stage).toBe('idle'); host.dispose();
  });
  it('checks SHA-256 before loading and reports real bytes', async () => {
    const directory = await mkdtemp(path.join(process.cwd(), 'gamesoul/cache/hash-test-'));
    try {
      const bytes = Buffer.from('GGUF-test-content'), file = path.join(directory, 'model.gguf'); await writeFile(file, bytes);
      const progress: number[] = [];
      await verifyModel(file, createHash('sha256').update(bytes).digest('hex'), new AbortController().signal, value => progress.push(value));
      expect(progress.at(-1)).toBe(bytes.length);
      await expect(verifyModel(file, '0'.repeat(64), new AbortController().signal, () => {})).rejects.toThrow('SHA-256');
    } finally { await rm(directory, { recursive: true }); }
  });
  it('reuses an already resident unchanged model across browser reloads without a new operation', async () => {
    const host = new NativeModelHost(process.cwd());
    const model = { id: 'qwen08', name: 'Qwen', path: 'model.gguf', sha256: 'a'.repeat(64), threads: 20, context: 4096, file: 'model.gguf', available: true, bytes: 100, signature: 'same-file-config' };
    vi.spyOn(host, 'catalog').mockResolvedValue([model]);
    Object.assign(host, { loaded: 'qwen08', loadedSignature: model.signature, operation: 9,
      state: { id: 'qwen08', operation: 9, stage: 'ready', progress: 1, startedAt: 10 } });
    expect(await host.select('qwen08', 'new-owner')).toEqual({ operation: 9, reused: true });
    await host.unload('qwen08', undefined, 'late-old-owner');
    expect(host.snapshot()).toMatchObject({ stage: 'ready', operation: 9 }); host.dispose();
  });
  it('does not clear a newer selection when queued old unload resumes', async () => {
    const host = new NativeModelHost(process.cwd()); let resume!: () => void;
    Object.assign(host, { owner: 'old', operation: 9, loaded: 'qwen08',
      state: { id: 'qwen08', operation: 9, stage: 'ready' }, work: new Promise<void>(r => { resume = r; }) });
    const unloading = host.unload('qwen08', 9, 'old');
    Object.assign(host, { owner: 'new', operation: 11, state: { id: 'qwen08', operation: 11, stage: 'ready' } });
    resume(); await unloading;
    expect(host.snapshot()).toMatchObject({ operation: 11, stage: 'ready' });
    expect((host as unknown as { loaded: string }).loaded).toBe('qwen08'); host.dispose();
  });
  it('cancels an unacknowledged selection by its owner without starting a model', async () => {
    const host = new NativeModelHost(process.cwd()); let resolve!: (value: Awaited<ReturnType<NativeModelHost['catalog']>>) => void;
    vi.spyOn(host, 'catalog').mockImplementation(() => new Promise(r => { resolve = r; }));
    const selected = host.select('qwen08', 'owner-a').catch(error => error);
    await host.unload('qwen08', undefined, 'owner-a');
    resolve([{ id: 'qwen08', name: 'Qwen', path: 'a.gguf', sha256: 'a'.repeat(64), threads: 20, context: 4096, file: 'a.gguf', available: true, bytes: 100, signature: 'file' }]);
    expect((await selected).message).toContain('取消'); expect(host.snapshot().stage).toBe('idle'); host.dispose();
  });
});
