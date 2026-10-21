export interface VillageChannelLine{id:string;from:string;to:string[];text:string;at:number;source:string}
/** Existing Unity world-channel wire shape, only acknowledged public utterances. */
export function projectVillageChannel<T extends object>(snapshot:T,messages:VillageChannelLine[]):T{
 const input=snapshot as T&{state?:{socialLife?:{messages?:unknown[]}}};if(!input.state||!messages.length)return snapshot;
 return {...snapshot,state:{...input.state,socialLife:{...input.state.socialLife,messages:[...(input.state.socialLife?.messages??[]),...messages]}}};
}
