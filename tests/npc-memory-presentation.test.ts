import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../src/games/camp/simulation/engine';
import { remember } from '../src/games/camp/npc/experience';
import { NpcMemoryPanel } from '../src/components/NpcMemoryPanel';
it('labels heard speech separately from facts and shows body and cognition fallback', () => {
  const s=createGame();remember(s,'azhuang','dialogue','老周说安排不公。','laozhou',['azhuang','laozhou'],'heard','只是老周的看法。');
  const html=renderToStaticMarkup(createElement(NpcMemoryPanel,{game:s,npc:s.npcs[0]}));
  expect(html).toContain('听到的发言');expect(html).toContain('只是老周的看法');expect(html).toContain('精力');expect(html).toContain('心智策略');
});
