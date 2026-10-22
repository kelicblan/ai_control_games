/** 可复用的二维线段空间索引；不包含村寨、资源或玩法数值。 */
export function segmentDistance(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);
}
/** Catmull-Rom插值保留每个控制点，河流跨区连续；只在装载定义时执行。 */
export function smoothLine(points,steps=12){
  const result=[];
  for(let i=0;i<points.length-1;i++){
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
    for(let s=0;s<steps;s++){
      const t=s/steps;result.push([0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t)));
    }
  }
  result.push([...points.at(-1)]);return result;
}
/** 仅回答线带附近的距离；远处返回Infinity，避免每块对整条河执行逐像素扫描。 */
export function lineIndex(lines,cellSize=512,margin=12){
  const cells=new Map();
  for(const line of lines)for(let i=1;i<line.points.length;i++){
    const a=line.points[i-1],b=line.points[i],pad=line.width+margin,entry={a,b,width:line.width,minX:Math.min(a[0],b[0])-pad,maxX:Math.max(a[0],b[0])+pad,minY:Math.min(a[1],b[1])-pad,maxY:Math.max(a[1],b[1])+pad};
    for(let cy=Math.floor((Math.min(a[1],b[1])-pad)/cellSize);cy<=Math.floor((Math.max(a[1],b[1])+pad)/cellSize);cy++)
      for(let cx=Math.floor((Math.min(a[0],b[0])-pad)/cellSize);cx<=Math.floor((Math.max(a[0],b[0])+pad)/cellSize);cx++){
        const key=`${cx}:${cy}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(entry);
      }
  }
  return(x,y)=>{
    let distance=Infinity;for(const line of cells.get(`${Math.floor(x/cellSize)}:${Math.floor(y/cellSize)}`)??[]){if(x<line.minX||x>line.maxX||y<line.minY||y>line.maxY)continue;distance=Math.min(distance,segmentDistance(x,y,line.a,line.b)-line.width);}
    return distance;
  };
}
