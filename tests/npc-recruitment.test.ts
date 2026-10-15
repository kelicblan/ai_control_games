import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency, agencyPerson } from '../src/games/camp/npc/experience';
import { ensureCampMind } from '../src/games/camp/npc/bridge';
import { updateCollectives } from '../src/games/camp/npc/collectives';
import { advanceRecruitment } from '../src/games/camp/npc/recruitment';
it('does not send invitations until actually reaching a peer and times out unreachable travel',()=>{
  const s=createGame();ensureAgency(s);const a=s.npcs[0],b=s.npcs[1];ensureCampMind(a).intent.kind='recruit';
  updateCollectives(s);const g=s.agency!.groups[0],p=agencyPerson(s,a.id);b.position={x:a.position.x+80,y:a.position.y};
  p.knownWork[b.id]={workload:10,at:0};
  advanceRecruitment(s,a,.1);expect(g.invited).toEqual([]);expect(p.invitation?.targetId).toBe(b.id);
  s.elapsed=16;advanceRecruitment(s,a,.1);expect(p.invitation).toBeNull();expect(g.invited).toEqual([]);expect(p.nextInviteAt).toBe(46);
});
it('allows a dissatisfied leader to recruit after an individual strike has already started',()=>{
  const s=createGame();ensureAgency(s);const a=s.npcs[0],b=s.npcs[1];ensureCampMind(a).intent.kind='refuse';
  updateCollectives(s);const g=s.agency!.groups[0];expect(g.stage).toBe('striking');
  a.mind!.intent.kind='recruit';agencyPerson(s,a.id).knownWork[b.id]={workload:12,at:0};b.position={x:a.position.x+30,y:a.position.y};
  expect(advanceRecruitment(s,a,.1)).toBe(true);expect(agencyPerson(s,a.id).invitation?.targetId).toBe(b.id);
});
