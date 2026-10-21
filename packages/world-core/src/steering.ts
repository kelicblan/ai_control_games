import type {WorldPoint} from './index';
export interface SteeringMemory {side:1|-1;until:number;blocked:number}
/** Bounded local motor control. Every swept segment is checked by the authoritative collision rules. */
export function steerStep(from:WorldPoint,target:WorldPoint,travel:number,now:number,canMove:(a:WorldPoint,b:WorldPoint)=>boolean,memory:SteeringMemory):WorldPoint|null{
 const dx=target.x-from.x,dy=target.y-from.y,d=Math.hypot(dx,dy);
 if(![from.x,from.y,target.x,target.y,travel,now].every(Number.isFinite)||travel<=0)return null;
 if(d<1e-8)return {...from};
 const length=Math.min(d,travel),heading=Math.atan2(dy,dx),probe=Math.min(d,Math.max(length,.85));
 const point=(angle:number,n:number)=>({x:from.x+Math.cos(angle)*n,y:from.y+Math.sin(angle)*n});
 const clear=(angle:number)=>canMove(from,point(angle,length))&&canMove(from,point(angle,probe));
 if(clear(heading)){memory.blocked=0;return point(heading,length);}
 // Keep the same passing side until the obstruction is cleared; do not alternate left/right each tick.
 const sides=now<memory.until?[memory.side]:[memory.side,-memory.side] as (1|-1)[];
 for(const magnitude of [Math.PI/6,Math.PI/3,Math.PI/2,Math.PI*2/3,Math.PI*5/6,Math.PI])for(const side of sides){
  const angle=heading+magnitude*side;if(!clear(angle))continue;
  memory.side=side as 1|-1;memory.until=now+1;memory.blocked=0;return point(angle,length);
 }
 memory.blocked++;if(memory.blocked%10===0){memory.side=memory.side===1?-1:1;memory.until=now;}
 return null;
}
/** Minimum distance along a movement segment; endpoint-only checks allow tunnelling through peers. */
export function segmentDistance(a:WorldPoint,b:WorldPoint,p:WorldPoint){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(1e-12,dx*dx+dy*dy)));return Math.hypot(a.x+t*dx-p.x,a.y+t*dy-p.y);}
