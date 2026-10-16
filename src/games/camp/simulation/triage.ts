import type {Npc} from './types';
export const RESCUE_FOOD_COST=2;
export const canRescue=(npc:Pick<Npc,'alive'|'health'>)=>npc.alive&&npc.health>0&&npc.health<=25;
