import { validPoint, type WorldPoint } from './index';

export interface GridRouteOptions { step?:number; maxNodes?:number; maxDistance?:number }
export interface GridRoute { points:WorldPoint[]; reached:boolean; visited:number }
interface Node { point:WorldPoint; x:number; y:number; cost:number; estimate:number; parent:Node|null }
/** 最小堆只存本次搜索边界。不会根据目标距离预先分配世界大小的数组。 */
class Frontier {
  private nodes:Node[]=[];
  get length(){return this.nodes.length;}
  push(node:Node){let i=this.nodes.length;this.nodes.push(node);
    while(i>0){const p=(i-1)>>>1;if(this.nodes[p].estimate<=node.estimate)break;this.nodes[i]=this.nodes[p];i=p;}this.nodes[i]=node;}
  pop():Node{const first=this.nodes[0],last=this.nodes.pop()!;if(this.nodes.length){let i=0;
    while(i*2+1<this.nodes.length){let child=i*2+1;if(child+1<this.nodes.length&&this.nodes[child+1].estimate<this.nodes[child].estimate)child++;
      if(this.nodes[child].estimate>=last.estimate)break;this.nodes[i]=this.nodes[child];i=child;}this.nodes[i]=last;}return first;}
}
const gap=(a:WorldPoint,b:WorldPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
/**
 * 与游戏/引擎无关的有预算A*。每条边交给宿主校验（实体、坡度、河流等）。
 * 远目标只返回可达的局部前进路线；reached=false不能被上层误判为任务完成。
 * 无路时原地停下，不回退到穿过障碍的直线，也不瞬移到最近网格。
 */
export function findGridRoute(from:WorldPoint,target:WorldPoint,canTraverse:(a:WorldPoint,b:WorldPoint)=>boolean,
  options:GridRouteOptions={}):GridRoute {
  const step=options.step??8,maxNodes=options.maxNodes??2048,maxDistance=options.maxDistance??192;
  if(!validPoint(from)||!validPoint(target)||!Number.isFinite(step)||step<=0||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>16384
    ||!Number.isFinite(maxDistance)||maxDistance<step||maxDistance>4096)throw new RangeError('导航坐标或搜索预算无效');
  if(gap(from,target)<=maxDistance&&canTraverse(from,target))return {points:[{...target}],reached:true,visited:0};
  const first:Node={point:{...from},x:0,y:0,cost:0,estimate:gap(from,target),parent:null};
  const queue=new Frontier(),costs=new Map<string,number>([['0:0',0]]);queue.push(first);
  let visited=0,best=first,reached=false;
  const neighbors=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
  while(queue.length&&visited<maxNodes){
    const node=queue.pop();if(node.cost!==(costs.get(`${node.x}:${node.y}`)))continue;visited++;
    if(gap(node.point,target)<gap(best.point,target)-1e-8)best=node;
    if(gap(node.point,target)<=step*1.5&&canTraverse(node.point,target)){
      best={point:{...target},x:node.x,y:node.y,cost:node.cost,estimate:0,parent:node};reached=true;break;}
    for(const [dx,dy] of neighbors){
      const x=node.x+dx,y=node.y+dy;if(Math.hypot(x,y)*step>maxDistance)continue;
      const point={x:from.x+x*step,y:from.y+y*step};if(!validPoint(point))continue;
      const cost=node.cost+Math.hypot(dx,dy)*step,key=`${x}:${y}`;
      if(cost>=(costs.get(key)??Infinity)-1e-8)continue;
      // 对角线本身和两条正交邻边都必须可走，防止擦着墙角切过碰撞体。
      if(!canTraverse(node.point,point))continue;
      if(dx&&dy&&(!canTraverse(node.point,{x:point.x,y:node.point.y})||!canTraverse(node.point,{x:node.point.x,y:point.y})))continue;
      costs.set(key,cost);queue.push({point,x,y,cost,estimate:cost+gap(point,target),parent:node});
    }
  }
  const points:WorldPoint[]=[];
  if(reached||gap(best.point,target)<gap(from,target)-step*.5){
    for(let node:Node|null=best;node&&node.parent;node=node.parent)points.push({...node.point});points.reverse();
  }
  return {points,reached,visited};
}
