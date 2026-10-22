// Deterministic terrain-constrained routing of authored waypoints. No simulation state.
export function routeRoads(lines,blocked){
 const step=64,limit=502,cache=new Map(),key=(x,y)=>y*limit+x;
 const safe=(x,y)=>{const k=key(x,y);if(!cache.has(k))cache.set(k,!blocked(x*step,y*step));return cache.get(k);};
 const clear=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/16);for(let i=0;i<=n;i++)if(blocked(a[0]+(b[0]-a[0])*i/(n||1),a[1]+(b[1]-a[1])*i/(n||1)))return false;return true;};
 const snap=p=>{const x=Math.round(p[0]/step),y=Math.round(p[1]/step);for(let r=0;r<100;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;if(x+dx>=0&&y+dy>=0&&x+dx<=500&&y+dy<=500&&safe(x+dx,y+dy))return[(x+dx)*step,(y+dy)*step];}throw Error('Road waypoint has no safe approach');};
 function route(a,b){
  if(clear(a,b))return[a,b];
  const start=snap(a),goal=snap(b),heap=[],g=new Map(),parent=new Map();
  const push=v=>{heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=v.f)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  const sx=start[0]/step,sy=start[1]/step,gx=goal[0]/step,gy=goal[1]/step,sk=key(sx,sy),gk=key(gx,gy);
  g.set(sk,0);push({x:sx,y:sy,k:sk,g:0,f:Math.hypot(gx-sx,gy-sy)});
  while(heap.length){const n=pop();if(n.g!==g.get(n.k))continue;if(n.k===gk){const points=[goal];let k=gk;while(k!==sk){k=parent.get(k);points.push([(k%limit)*step,Math.floor(k/limit)*step]);}points.reverse();if(clear(a,start))points.unshift(a);if(clear(goal,b))points.push(b);const result=[points[0]];for(let i=0;i<points.length-1;){let j=points.length-1;while(j>i+1&&!clear(points[i],points[j]))j--;result.push(points[j]);i=j;}return result;}
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=n.x+dx,y=n.y+dy;if(x<0||y<0||x>500||y>500||!safe(x,y)||!clear([n.x*step,n.y*step],[x*step,y*step]))continue;const k=key(x,y),cost=n.g+Math.hypot(dx,dy);if(cost>=(g.get(k)??Infinity))continue;g.set(k,cost);parent.set(k,n.k);push({x,y,k,g:cost,f:cost+Math.hypot(x-gx,y-gy)});}
  }throw Error('Disconnected authored road '+JSON.stringify({a,b,start,goal,visited:g.size}));
 }
 const snapped=new Map();const anchor=p=>{const k=p.join(',');if(!snapped.has(k))snapped.set(k,blocked(...p)?snap(p):p);return snapped.get(k);};
 return lines.map(line=>{const points=line.map(anchor),out=[];for(let i=1;i<points.length;i++)out.push(...route(points[i-1],points[i]).slice(i===1?0:1));return out;});
}

