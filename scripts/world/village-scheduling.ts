/** Stable phase only; identity never enters the model. Keeps each NPC's 0.5s cadence while spreading inference work. */
export function villagePolicyPhase(actorId:string){let phase=0;for(const char of actorId)phase=(phase*31+char.charCodeAt(0))%5;return phase;}
