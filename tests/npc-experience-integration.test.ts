import { expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { agencyPerson, ensureAgency, reviseSpeechMemory } from '../src/games/camp/npc/experience';
import { baselinePolicy } from '../src/games/camp/ai/policy';
it('records actual player and NPC conversation only for participants', () => {
  const initial = createGame(); initial.status = 'playing'; ensureAgency(initial);
  const open = issueCommand(initial, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
  const next = issueCommand(open, { type: 'social-chat', threadId: open.social.threads.at(-1)!.id, npcId: 'azhuang', text: '你最近累不累？' });
  expect(next.agency!.people.azhuang!.memory.recent.some(e => e.actorId === 'player' && e.fact.includes('累不累'))).toBe(true);
  expect(next.agency!.people.shenyan?.memory.recent.some(e => e.fact.includes('累不累')) ?? false).toBe(false);
});
it('captures changing body and expression and revises the same utterance without a new event', () => {
  const initial = createGame(); initial.status = 'playing'; ensureAgency(initial);
  initial.npcs[0].energy = 15; agencyPerson(initial, 'azhuang').body = [100, 90, 0];
  const next = advanceGame(initial, .1, baselinePolicy);
  expect(next.agency!.people.azhuang!.memory.recent.some(e => e.category === 'body')).toBe(true);
  const own = next.agency!.people.azhuang!.memory.recent;
  const line = [...own].reverse().find(e => e.category === 'self');
  if (line) {
    const before = next.npcs[0].speech, count = own.length;
    reviseSpeechMemory(next, 'azhuang', before, '我真的需要歇歇了。');
    expect(own.length).toBe(count);
    expect(own.find(e => e.eventId === line.eventId)!.fact).toContain('歇歇');
  }
});
