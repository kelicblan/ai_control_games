import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DialogueSourceIcon, currentSpeechSource } from '../src/components/DialogueSourceIcon';
import { createGame } from '../src/games/camp/simulation/engine';
import { applyDialogue, createDialogueTicket } from '../src/games/camp/dialogue';
import { isValidGameState, restoreGameState } from '../src/games/camp/simulation/persistence';

describe('dialogue attribution', () => {
  it.each([['template', 'code', '代码兜底'], ['minimind3', 'minimind3', 'MiniMind3'],
    ['native:gamesoul', 'preferred', '优先模型'], ['remote:custom', 'preferred', '优先模型'],
    ['cache', 'unknown', '来源未记录']])('renders %s with a distinct accessible icon', (source, kind, label) => {
    const html = renderToStaticMarkup(createElement(DialogueSourceIcon, { source }));
    expect(html).toContain(`data-dialogue-kind="${kind}"`);
    expect(html).toContain(label); expect(html).toContain('<svg');
  });
  it('does not label player text as model speech', () => {
    expect(renderToStaticMarkup(createElement(DialogueSourceIcon, { source: 'player' }))).toBe('');
  });
  it('persists the real model source and invalidates attribution when code replaces a caption', () => {
    const state = createGame({ seed: 17 }); state.status = 'playing';
    const npc = state.npcs[0]; npc.speech = '我先去看看大家。'; npc.speechUntil = 8;
    expect(currentSpeechSource(npc)).toBe('template');
    const next = applyDialogue(state, createDialogueTicket(state, npc), '我先照应一下大家。', 'native:gamesoul');
    expect(next).not.toBe(state);
    const restored = restoreGameState(JSON.parse(JSON.stringify(next)))!;
    expect(isValidGameState(restored)).toBe(true);
    expect(currentSpeechSource(restored.npcs[0])).toBe('native:gamesoul');
    restored.npcs[0].speech = '寨门关着，等待开门再通行。';
    expect(currentSpeechSource(restored.npcs[0])).toBe('template');
    restored.npcs[0].speech = next.npcs[0].speech; restored.npcs[0].speechUntil++;
    expect(currentSpeechSource(restored.npcs[0])).toBe('template');
  });
});
