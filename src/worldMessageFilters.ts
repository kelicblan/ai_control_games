import type { WorldMessage } from './gameMessages';

export type WorldMessageFilter = 'all' | 'system' | 'channel';
export const WORLD_MESSAGE_LIMITS={all:150,system:50,channel:100} as const;
const isConversation=(message:WorldMessage)=>message.kind==='npc'||message.kind==='player';
export function retainWorldMessages(messages: readonly WorldMessage[]):WorldMessage[] {
  let system=0,conversation=0;
  const retained:WorldMessage[]=[];
  for(let index=messages.length-1;index>=0;index--){
    const message=messages[index];
    if(isConversation(message)?++conversation<=WORLD_MESSAGE_LIMITS.channel:++system<=WORLD_MESSAGE_LIMITS.system)retained.push(message);
  }
  return retained.reverse();
}
/** All tabs share the same bounded history; filtering never changes or duplicates it. */
export function filterWorldMessages(messages: readonly WorldMessage[], filter: WorldMessageFilter) {
  return messages.filter(message=>{
    const conversation=isConversation(message);
    return filter==='all'||(filter==='channel'?conversation:!conversation);
  });
}
