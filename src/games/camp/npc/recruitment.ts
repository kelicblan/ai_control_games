import type { GameState, Npc } from '../simulation/types';
import { agencyPerson } from './experience';
import { invitePeer } from './collectives';
import { distance, MOVE_SPEED } from '../simulation/constants';
import { moveWorldBody } from '../world/navigation';
export function advanceRecruitment(state:GameState,npc:Npc,dt:number):boolean {
  if(!state.agency?.enabled)return false;
  const p=agencyPerson(state,npc.id),group=state.agency.groups.find(g=>g.initiator===npc.id&&g.stage!=='ended'&&!g.promise);
  if(!group||npc.mind?.intent.kind!=='recruit'||npc.inventory.food||npc.inventory.wood||npc.energy<18||npc.health<35||npc.hunger>76){p.invitation=null;return false;}
  if(!p.invitation&&state.elapsed>=p.nextInviteAt){
    const target=state.npcs.filter(n=>n.alive&&n.id!==npc.id&&p.knownWork[n.id]&&!group.invited.includes(n.id)&&!group.members.includes(n.id))
      .sort((a,b)=>distance(npc.position,a.position)-distance(npc.position,b.position))[0];
    if(!target){if(group.stage==='recruiting')group.stage='negotiating';return false;}
    p.invitation={groupId:group.id,targetId:target.id,since:state.elapsed,origin:{...npc.position}};
  }
  const invitation=p.invitation;if(!invitation)return false;
  const target=state.npcs.find(n=>n.id===invitation.targetId);
  if(!target?.alive||state.elapsed-invitation.since>15){p.invitation=null;p.nextInviteAt=state.elapsed+30;delete npc.worldRoute;return false;}
  if(invitePeer(state,group,target.id)){p.invitation=null;p.nextInviteAt=state.elapsed+30;delete npc.worldRoute;return true;}
  npc.destination={...target.position};
  const motion=moveWorldBody(npc,npc.destination,MOVE_SPEED,dt,state.npcs,state.seed,false,state.world?.gateOpen??true);
  npc.position=motion.position;npc.energy=Math.max(0,npc.energy-motion.distanceMoved*.23/MOVE_SPEED);
  return true;
}
