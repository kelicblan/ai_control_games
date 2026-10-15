import { describe, expect, it, vi } from 'vitest';
import { isPublicAddress, resolveRemote, remoteCompletion } from '../scripts/native-models/remote';

describe('remote bridge', () => {
  it('allows an otherwise successful remote generation to take more than five seconds', async () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms); return controller.signal; });
    try {
      const send = vi.fn(() => new Promise<{ status: number; body: string }>(resolve => setTimeout(() => resolve({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '我们一起商量吧。' } }] }) }), 8000)));
      const result = remoteCompletion({ config: { id: 'remote-glm', name: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', model: 'glm-5.3-flash' }, prompt: '你好' }, new AbortController().signal, send);
      const assertion = expect(result).resolves.toMatchObject({ content: '我们一起商量吧。' });
      await vi.advanceTimersByTimeAsync(8100); await assertion;
    } finally { timer.mockRestore(); vi.useRealTimers(); }
  });
  it('recovers proxy fake DNS only through separately verified public answers, still rejecting private and literal fake addresses', async () => {
    const local = vi.fn().mockResolvedValue([{ address: '198.18.0.162', family: 4 }]);
    const recovery = vi.fn().mockResolvedValue([{ address: '47.245.63.126', family: 4 }]);
    expect(await resolveRemote(new URL('https://open.bigmodel.cn'), local, recovery)).toEqual([{ address: '47.245.63.126', family: 4 }]);
    recovery.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(resolveRemote(new URL('https://open.bigmodel.cn'), local, recovery)).rejects.toThrow('公网');
    recovery.mockClear(); await expect(resolveRemote(new URL('https://198.18.0.162'), local, recovery)).rejects.toThrow('公网');
    expect(recovery).not.toHaveBeenCalled();
  });
  it('corrects the BigModel placeholder path and leaves a reasoning budget for GLM 5 test responses', async () => {
    const send = vi.fn().mockResolvedValue({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '准备好了。' } }] }) });
    await remoteCompletion({ config: { id: 'remote-glm', name: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/v1', model: 'glm-5.3-flash' }, prompt: '你好', test: true }, new AbortController().signal, send);
    expect(send.mock.calls[0][0].pathname).toBe('/api/paas/v4/chat/completions');
    expect(send.mock.calls[0][1].max_tokens).toBe(1024);
    expect(send.mock.calls[0][1].reasoning_effort).toBe('low');
    send.mockResolvedValue({ status: 429, body: JSON.stringify({ error: { code: '1113', message: 'private-upstream-text' } }) });
    await expect(remoteCompletion({ config: { id: 'remote-glm', name: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/v1', model: 'glm-5.3-flash' }, prompt: '你好', test: true }, new AbortController().signal, send)).rejects.toThrow('余额不足');
    send.mockResolvedValue({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'length' }] }) });
    await expect(remoteCompletion({ config: { id: 'remote-glm', name: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/v1', model: 'glm-5.3-flash' }, prompt: '你好', test: true }, new AbortController().signal, send)).rejects.toThrow('尚未生成正文');
  });
  it('blocks private, reserved, mapped and loopback IPv4/IPv6 addresses', () => {
    for (const ip of ['127.0.0.1', '0.0.0.0', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true); expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('rejects DNS aliases and mixed public/private resolution', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(resolveRemote(new URL('https://provider.example'), lookup)).rejects.toThrow('公网');
    await expect(resolveRemote(new URL('https://localhost'), lookup)).rejects.toThrow('公网');
    await expect(resolveRemote(new URL('https://[::1]'), lookup)).rejects.toThrow('公网');
  });
  it('forwards the compatible payload with bounded output and sanitized upstream errors', async () => {
    const send = vi.fn().mockResolvedValue({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '准备好了。' } }] }) });
    const data = { config: { id: 'remote-a', name: 'A', baseUrl: 'https://provider.example/v1', model: 'small' }, apiKey: 'fake-session-key', prompt: '你好' };
    const result = await remoteCompletion(data, new AbortController().signal, send);
    expect(result.content).toBe('准备好了。'); expect(send.mock.calls[0][0].pathname).toBe('/v1/chat/completions');
    expect(send.mock.calls[0][1]).toMatchObject({ model: 'small', stream: false, max_tokens: 64, messages: [{ role: 'user', content: '你好' }] });
    send.mockResolvedValue({ status: 401, body: 'fake-session-key upstream-private-diagnostic' });
    await expect(remoteCompletion(data, new AbortController().signal, send)).rejects.toThrow('HTTP 401');
    await expect(remoteCompletion(data, new AbortController().signal, send)).rejects.not.toThrow('fake-session-key');
    send.mockResolvedValue({ status: 302, body: '{}' }); await expect(remoteCompletion(data, new AbortController().signal, send)).rejects.toThrow('HTTP 302');
    send.mockResolvedValue({ status: 200, body: JSON.stringify({ choices: [] }) }); await expect(remoteCompletion(data, new AbortController().signal, send)).rejects.toThrow('有效文本');
  });
  it('preserves system/user roles and strips local ChatML assistant scaffolding', async () => {
    const send = vi.fn().mockResolvedValue({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '收到，我会认真听。' } }] }) });
    await remoteCompletion({ config: { id: 'remote-a', name: 'A', baseUrl: 'https://provider.example/v1', model: 'small' },
      prompt: '<|im_start|>system\n你是角色。<|im_end|>\n<|im_start|>user\n下雨了。<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n' }, new AbortController().signal, send);
    expect(send.mock.calls[0][1].messages).toEqual([{ role: 'system', content: '你是角色。' }, { role: 'user', content: '下雨了。' }]);
  });
  it('cancels even while an upstream dependency has not settled', async () => {
    const abort = new AbortController();
    const result = remoteCompletion({ config: { id: 'remote-a', name: 'A', baseUrl: 'https://provider.example/v1', model: 'small' }, prompt: '你好' }, abort.signal, () => new Promise(() => {}));
    abort.abort(); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('does not start an upstream operation for an already cancelled request', async () => {
    const abort = new AbortController(); abort.abort();
    const send = vi.fn().mockResolvedValue({ status: 200, body: '{}' });
    await expect(remoteCompletion({ config: { id: 'remote-a', name: 'A', baseUrl: 'https://provider.example/v1', model: 'small' }, prompt: '你好' }, abort.signal, send)).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
  });
});
