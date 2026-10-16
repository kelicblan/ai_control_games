import type { GameCommand, NpcId, Point } from './games/camp/simulation/types';

/** One explicit user gesture authorizes one destination for one specific NPC. */
export class NpcDispatchIntent {
  private npcId:NpcId|null=null;
  arm(npcId:NpcId){this.npcId=npcId;}
  cancel(){this.npcId=null;}
  take(npcId:NpcId,target:Point):GameCommand|null {
    const armed=this.npcId;this.cancel();
    if(armed!==npcId||!Number.isFinite(target.x)||!Number.isFinite(target.y))return null;
    return {type:'move',npcId:armed,target:{...target}};
  }
}
