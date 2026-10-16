import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency, agencyPerson } from '../src/games/camp/npc/experience';
import { ensureCampMind } from '../src/games/camp/npc/bridge';
import { updateCollectives, invitePeer, replyCollective, collectiveActionCompleted } from '../src/games/camp/npc/collectives';
it('creates bounded groups, records invitations only for people present and requires actual recovery', () => {
  const s=createGame();ensureAgency(s);s.status='playing';const a=s.npcs[0],b=s.npcs[1];
  const m=ensureCampMind(a);m.intent.kind='recruit';m.concerns=[{id:1,kind:'rest',status:'open',openedAt:0,updatedAt:0,resolvedAt:null,denials:3,severity:.9}];m.nextConcernId=2;
  a.energy=20;b.position={...a.position};agencyPerson(s,a.id);agencyPerson(s,b.id);
  updateCollectives(s);const group=s.agency!.groups[0];expect(group.members).toEqual([a.id]);
  invitePeer(s,group,b.id);const count=s.agency!.sequence;invitePeer(s,group,b.id);expect(s.agency!.sequence).toBe(count);
  expect(s.agency!.people.shenyan?.memory.recent.length??0).toBe(0);
  replyCollective(s,group.id,'rest');expect(group.stage).toBe('easing');
  expect(group.promise!.fulfilled).toEqual([]);
  collectiveActionCompleted(s,a.id,'rest');
  // Low energy has not actually recovered, a completed token rest is insufficient.
  expect(group.promise!.fulfilled).not.toContain(a.id);
  a.energy=90;collectiveActionCompleted(s,a.id,'rest');expect(group.promise!.fulfilled).toContain(a.id);
});
it('rejects remote invitations through a closed gate or outside hearing range', () => {
  const s=createGame();ensureAgency(s);const a=s.npcs[0],b=s.npcs[1];ensureCampMind(a).intent.kind='recruit';
  updateCollectives(s);const g=s.agency!.groups[0];b.position={x:a.position.x+80,y:a.position.y};
  expect(invitePeer(s,g,b.id)).toBe(false);expect(g.invited).toEqual([]);
});
