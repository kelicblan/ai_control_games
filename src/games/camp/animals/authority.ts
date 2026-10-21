import type {AnimalWorld,Point} from './engine';
export interface Hunt{actorId:string;targetId:string;phase:'pursue'|'attack'|'collect';until:number;attackAt:number;route:Point[];routeAt:number;operationId:string;blocked:number}
export interface WildlifeAuthority{ecology:AnimalWorld;hunt:Hunt|null;operations:Record<string,string>;habitatVersion?:string}
