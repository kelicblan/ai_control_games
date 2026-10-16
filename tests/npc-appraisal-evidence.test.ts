import { expect,it } from 'vitest';
import {createGame} from '../src/games/camp/simulation/engine';
import {ensureAgency,remember} from '../src/games/camp/npc/experience';
import {ensureCampMind} from '../src/games/camp/npc/bridge';
import {acceptAppraisal,appraisalSignature,type AppraisalTicket} from '../src/games/camp/npc/appraisal';
it('only newly cited external evidence can change emotions',()=>{
  const s=createGame();ensureAgency(s).cognition=true;const n=s.npcs[0],m=ensureCampMind(n);m.emotions.anger=.2;
  const old=remember(s,n.id,'social','休息诉求被拒绝。','player',[n.id],'experienced','',1);
  const ticket:AppraisalTicket={id:'a',player:'p',generation:'g',branch:'b',npcId:n.id,at:0,through:old.sequence,settingsRevision:0,signature:appraisalSignature(n,s),evidence:[old],targets:[]};
  const raw=JSON.stringify({version:1,summary:'感到不满',evidenceIds:[old.eventId],goal:'协商',emotionAssessment:{anger:1,resentment:1,stress:1},preferences:{bargain:.2},expression:{text:'我想先谈谈。',targetId:null}});
  acceptAppraisal(s,ticket,raw);const after=m.emotions.anger;
  const unrelated=remember(s,n.id,'action','实际改为待机。');
  acceptAppraisal(s,{...ticket,id:'b',through:unrelated.sequence,evidence:[old,unrelated]},raw);
  expect(m.emotions.anger).toBe(after);
});
it('accepts a slow native result while simulation advances, but still rejects changed state and expired tickets',()=>{
  const s=createGame();ensureAgency(s).cognition=true;ensureCampMind(s.npcs[0]);const n=s.npcs[0];
  const evidence=remember(s,n.id,'action','劳动很久后感到疲惫。');
  const ticket:AppraisalTicket={id:'local',player:'p',generation:'g',branch:'b',npcId:n.id,at:0,through:evidence.sequence,settingsRevision:0,signature:appraisalSignature(n,s),evidence:[evidence],targets:[],validFor:120};
  const raw=JSON.stringify({version:1,summary:'想休息',evidenceIds:[evidence.eventId],goal:'休息',emotionAssessment:{anger:0,resentment:0,stress:.4},preferences:{rest:.2},expression:{text:'我想歇歇。',targetId:null}});
  s.elapsed=104;expect(acceptAppraisal(s,ticket,raw)).not.toBeNull();
  expect(acceptAppraisal(s,{...ticket,validFor:45},raw)).toBeNull();
  n.energy-=20;expect(acceptAppraisal(s,ticket,raw)).toBeNull();n.energy+=20;
  s.elapsed=121;expect(acceptAppraisal(s,ticket,raw)).toBeNull();
});
