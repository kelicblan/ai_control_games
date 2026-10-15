import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { createDialogueTicket } from '../src/games/camp/dialogue/context';
import { buildFallbackSelection } from '../src/games/camp/dialogue/fallback-selection';
import { cleanCaption } from '../src/games/camp/dialogue/language';
import { validDialogueLine } from '../src/games/camp/dialogue/commit';

it('supplies model-selected captions which preserve refusal, safety facts and recent-line exclusions', () => {
  const state = createGame({ seed: 64138, mode: 'model' });
  const original = createDialogueTicket(state, state.npcs[0]).payload;
  for (const kind of ['request', 'complaint', 'refusal', 'recruit']) {
    const payload = { ...original, facts: ['天气雷暴', '精疲力尽'], worldContext: ['寨门关闭', '身在村寨内'],
      publicExpression: { kind, tone: 'angry', reason: '当前立场', allowDeception: false } };
    const selection = buildFallbackSelection(payload)!;
    expect(selection.choices.length).toBeGreaterThan(0); expect(selection.prompt.length).toBeLessThan(400);
    for (const text of selection.choices) { expect(validDialogueLine(text)).toBe(true); expect(cleanCaption(text, payload)).toBe(text); }
    const next = buildFallbackSelection({ ...payload, recentLines: selection.choices })!;
    expect(next.choices.length).toBeGreaterThan(0);
    expect(next.choices.some(text => selection.choices.includes(text))).toBe(false);
    const candidates = [...selection.choices, ...next.choices];
    const later = buildFallbackSelection({ ...payload, recentLines: candidates.slice(0, 5), event: candidates[5] });
    expect(later?.choices.length).toBeGreaterThan(0);
  }
});
