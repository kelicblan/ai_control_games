import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency } from '../src/games/camp/npc/experience';
import { ensureCampMind } from '../src/games/camp/npc/bridge';
import { updateCollectives, replyCollective, collectiveActionCompleted } from '../src/games/camp/npc/collectives';
function fixture(){const s=createGame();ensureAgency(s);const n=s.npcs[0],m=ensureCampMind(n);m.intent.kind='refuse';m.concerns=[{id:1,kind:'rest',status:'open',openedAt:0,updatedAt:0,resolvedAt:null,denials:3,severity:.8}];m.nextConcernId=2;n.energy=20;updateCollectives(s);return {s,n,m,g:s.agency!.groups[0]};}
it('fulfilled recovery ends a conflict, while merely granting time does not',()=>{
  const {s,n,g}=fixture();replyCollective(s,g.id,'rest');updateCollectives(s);expect(g.stage).toBe('easing');
  n.energy=90;collectiveActionCompleted(s,n.id,'rest');updateCollectives(s);expect(g.stage).toBe('ended');
  const revision=s.agency!.sequence;updateCollectives(s);expect(s.agency!.sequence).toBe(revision);
});
it('counts broken collective promises once and permits renewed negotiations',()=>{
  const {s,g}=fixture();replyCollective(s,g.id,'rest');s.elapsed=61;updateCollectives(s);expect(g.stage).toBe('striking');
  const count=s.agency!.sequence;updateCollectives(s);expect(s.agency!.sequence).toBe(count);
  replyCollective(s,g.id,'listen');expect(g.stage).toBe('negotiating');
});
it('listening again cannot invalidate an existing promise or prevent actual fulfillment',()=>{
  const {s,n,g}=fixture();replyCollective(s,g.id,'rest');replyCollective(s,g.id,'listen');
  n.energy=90;collectiveActionCompleted(s,n.id,'rest');updateCollectives(s);expect(g.stage).toBe('ended');
});
