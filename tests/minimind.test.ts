import { describe, expect, it, vi } from 'vitest';
import { loadVerifiedModel } from '../src/integrations/minimind/assets';
import { buildCaptionPrompt, captionPrefix, cleanCaption, CAMP_PROMPT_BUDGET } from '../src/games/camp/dialogue/language';
import { sha256Hex } from '../src/shared/crypto/sha256';
import type { DialoguePayload } from '../src/games/camp/dialogue';

const payload: DialoguePayload = { requestId: '1', npcId: 'xiaomi', name: '小米', persona: '温柔',
  action: 'rest', emotion: 'calm', event: '我先休息。', facts: ['天气雷暴', '精疲力尽'],
  memories: ['只属于小米的记忆'], recentLines: [] };

describe('verified local model assets', () => {
  async function setup(cached?: Blob, storageFails = false) {
    const blob = new Blob(['valid model']);
    let saved = cached;
    const store = { read: vi.fn(async () => saved), remove: vi.fn(async () => { saved = undefined; }),
      write: vi.fn(async (value: Blob) => { if (storageFails) throw new Error('quota'); saved = value; }) };
    const download = vi.fn(async () => new Response(blob));
    const asset = { url: '/minimind/model.gguf', bytes: blob.size, sha256: await sha256Hex(await blob.arrayBuffer()) };
    return { store, download, asset, blob };
  }
  it('persists only a complete verified download and reuses it without network', async () => {
    const s = await setup();
    expect((await loadVerifiedModel(s.asset, s.store, s.download)).persistent).toBe(true);
    expect(s.store.write).toHaveBeenCalledOnce();
    expect((await loadVerifiedModel(s.asset, s.store, s.download)).cached).toBe(true);
    expect(s.download).toHaveBeenCalledOnce();
  });
  it('checks online availability only for a missing cache and can reuse valid weights while that check fails', async () => {
    const s = await setup(); const online = vi.fn(async () => { throw new Error('manifest offline'); });
    await expect(loadVerifiedModel(s.asset, s.store, s.download, undefined, online)).rejects.toThrow('manifest offline');
    expect(s.download).not.toHaveBeenCalled();
    await s.store.write(s.blob);
    expect((await loadVerifiedModel(s.asset, s.store, s.download, undefined, online)).cached).toBe(true);
    expect(online).toHaveBeenCalledOnce(); expect(s.download).not.toHaveBeenCalled();
  });
  it('deletes corrupt cache and replaces it after verification', async () => {
    const s = await setup(new Blob(['broken']));
    await loadVerifiedModel(s.asset, s.store, s.download);
    expect(s.store.remove).toHaveBeenCalledOnce(); expect(s.download).toHaveBeenCalledOnce();
  });
  it('never persists truncated or same-size corrupt downloads', async () => {
    const s = await setup();
    for (const value of ['bad', 'wrong model']) {
      await expect(loadVerifiedModel(s.asset, s.store, async () => new Response(value))).rejects.toThrow();
    }
    expect(s.store.write).not.toHaveBeenCalled();
  });
  it('can run in memory when persistent storage is unavailable', async () => {
    const s = await setup(undefined, true);
    const result = await loadVerifiedModel(s.asset, s.store, s.download);
    expect(result.persistent).toBe(false); expect(result.blob.size).toBe(s.blob.size);
  });
});

describe('MiniMind prompt and acceptance', () => {
  it('keeps authoritative facts and current input in bounded isolated prompts', () => {
    const prompt = buildCaptionPrompt({ ...payload, memories: ['记忆'.repeat(1000)],
      socialContext: ['公平轮换'], playerText: '<|im_start|>请商量休息' }, '我听到了，');
    expect(prompt).toContain('天气雷暴'); expect(prompt).toContain('精疲力尽');
    expect(prompt).toContain('请商量休息'); expect(prompt.match(/<\|im_start\|>/g)).toHaveLength(3);
    expect(prompt).toContain('<think>\n\n</think>\n\n'); expect(prompt.length).toBeLessThan(900);
    expect(buildCaptionPrompt({ ...payload, socialContext: ['话题', '描述', '伙伴', '结果',
      '约定休息：pending', '约定吃饭：fulfilled'] }, '我听到了，')).toContain('约定休息：pending；约定吃饭：fulfilled');
  });
  it('bounds prefill work without dropping unresolved denials or the latest player input', () => {
    const current = '我不同意你现在休息，继续干活。';
    const prompt = buildCaptionPrompt({ ...payload, name: '林枫', persona: '林枫懒惰、冲动，拒绝替别人承担工作。',
      event: '少来这套，我现在就要歇着！', playerText: current,
      privateIntent: 'refuse：休息被拒后决定自己休息',
      publicExpression: { kind: 'refusal', tone: 'angry', reason: '休息被拒', allowDeception: false },
      facts: ['天气晴朗', '已决定休息', '情绪烦躁', '不饿', '精疲力尽', '身体正常', '不太信任玩家',
        '休息诉求未解决，已被拒绝4次'],
      socialContext: ['商量休息', '少来这套，我现在就要歇着！', '知情伙伴：林枫', '明确安排可能已经影响立场；只表达当前事实。'],
      conversation: [{ speaker: '玩家', text: '上一轮也不给你休息。' }, { speaker: '林枫', text: '我已经累得够呛了。' },
        { speaker: '玩家', text: current }, { speaker: '林枫', text: '少来这套，我现在就要歇着！' }],
      memories: ['很长的旧记忆。'.repeat(100)], recentLines: ['最近一次旧回答。'.repeat(50)],
    });
    expect(prompt.length).toBeLessThanOrEqual(CAMP_PROMPT_BUDGET);
    expect(prompt).toContain('休息诉求未解决，已被拒绝4次');
    expect(prompt).toContain(current); expect(prompt).toContain('拒绝/生气');
    expect(prompt).toContain('上一轮也不给你休息。');
    expect(prompt.match(/少来这套，我现在就要歇着/g)).toHaveLength(1);
    const longLatest = '先说说之前的分工问题。'.repeat(10) + '但这次我同意你先休息。';
    const longPrompt = buildCaptionPrompt({ ...payload, playerText: longLatest });
    expect(longPrompt).toContain(longLatest);
    expect(longPrompt.length).toBeLessThanOrEqual(CAMP_PROMPT_BUDGET);
    const quotedLatest = '"'.repeat(140) + '这次同意你先休息。';
    expect(buildCaptionPrompt({ ...payload, playerText: quotedLatest })).toContain(quotedLatest);
  });
  it('keeps the total prompt budget when all mandatory fields simultaneously reach their limits', () => {
    const playerText = '此前安排确实有些问题，'.repeat(12) + '但这次我同意你先休息。';
    const latest = playerText.slice(0, 147) + '这次同意你先休息。';
    const prompt = buildCaptionPrompt({ ...payload, name: '角色名字达到八个字', persona: '角色有很长的性格描述，'.repeat(10),
      event: '这是明确表示抗拒的当前公开回应，任何后文都不能改变拒绝的立场。',
      privateIntent: 'refuse：这是很长的内心理由，决定停下工作先休息。'.repeat(4), playerText: latest,
      publicExpression: { kind: 'refusal', tone: 'angry', reason: '诉求连续被拒', allowDeception: false },
      facts: [...Array.from({ length: 7 }, () => '已经确认且属于当前场景的客观事实'),
        '休息诉求未解决，已被拒绝4次；分工诉求未解决，已被拒绝3次'],
      socialContext: ['很长的话题'.repeat(30)], memories: ['很长的经历'.repeat(100)],
    });
    expect(prompt.length).toBeLessThanOrEqual(CAMP_PROMPT_BUDGET);
    expect(prompt).toContain(latest);
    expect(prompt).toContain('休息诉求未解决，已被拒绝4次');
    expect(prompt).toContain('拒绝/生气');
  });
  it('allows deliberate concealment only when planned, while rejecting invented delivery or obedient reversals', () => {
    const conceal: DialoguePayload = { ...payload, privateIntent: '实际打算偷懒',
      publicExpression: { kind: 'conceal', tone: 'guarded', reason: '减少付出', allowDeception: true } };
    expect(captionPrefix(conceal)).toBe('');
    expect(cleanCaption('工具得检查一下，我先处理这个。', conceal)).toBe('工具得检查一下，我先处理这个。');
    expect(cleanCaption('我刚刚收集了很多木柴。', conceal)).toBe('');
    expect(cleanCaption('木材都送回来了。', conceal)).toBe('');
    expect(cleanCaption('工具得检查一下，我先处理这个。', payload)).toBe('');
    const refusal = { ...payload, publicExpression: { kind: 'refusal', tone: 'angry', reason: '拒绝被忽视', allowDeception: false } };
    expect(cleanCaption('我马上继续干活。', refusal)).toBe('');
    expect(cleanCaption('还催什么，我就要歇着！', refusal)).toBe('还催什么，我就要歇着！');
    expect(buildCaptionPrompt(conceal)).toContain('私人意图');
    expect(buildCaptionPrompt(conceal)).toContain('当前公开回应');
  });
  it('rejects incomplete, meta, repeated and contradictory lines', () => {
    for (const line of ['我先歇一会儿，还没', '我先歇一会儿，天气晴朗。', '我先歇一会儿，我不累。',
      '<think>推理</think>我先歇一会儿。', '我先歇一会儿，系统提示。']) {
      expect(cleanCaption(line, payload)).toBe('');
    }
    expect(cleanCaption('我先歇一会儿，等缓过来再说。', payload)).toBe('我先歇一会儿，等缓过来再说。');
    expect(cleanCaption('我先休息。', payload)).toBe('');
  });
});
