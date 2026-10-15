import type { ExplorationMap, MapView, WorldPoint } from '../../world-core/src';

/** World-aligned raster, independent of the DOM and actor overlays. */
export class MiniMapRaster {
  private readonly tiles=new Map<string,{pixels:Uint8ClampedArray;used:number}>();
  private generation=0;
  private readonly pixels=new Uint8ClampedArray(130*130*4);
  constructor(private exploration:ExplorationMap,private colorAt:(p:WorldPoint)=>readonly[number,number,number]) {}
  render(view:MapView,maxSamples=1024,budgetMs=3) {
    const pixels=this.pixels,step=view.span/128,generation=++this.generation;
    let samples=0,hits=0,sampleMs=0,pending=false;
    const x=Math.floor((view.center.x-view.span/2)/step),y=Math.floor((view.center.y-view.span/2)/step);
    for(let row=0;row<130;row++)for(let col=0;col<130;col++){
      const point={x:(x+col+.5)*step,y:(y+row+.5)*step};
      const out=(row*130+col)*4;
      pixels[out]=4;pixels[out+1]=7;pixels[out+2]=9;pixels[out+3]=255;
      if(!this.exploration.isExplored(point))continue;
      const tx=Math.floor((x+col)/32),ty=Math.floor((y+row)/32),key=`${step}:${tx}:${ty}`;
      let tile=this.tiles.get(key);
      if(!tile){tile={pixels:new Uint8ClampedArray(32*32*4),used:generation};this.tiles.set(key,tile);}
      tile.used=generation;
      const index=((y+row-ty*32)*32+x+col-tx*32)*4;
      if(!tile.pixels[index+3]){
        if(samples>=maxSamples||sampleMs>=budgetMs){pending=true;pixels[out]=70;pixels[out+1]=80;pixels[out+2]=65;continue;}
        const started=performance.now(),color=this.colorAt(point);sampleMs+=performance.now()-started;samples++;
        tile.pixels[index]=color[0];tile.pixels[index+1]=color[1];tile.pixels[index+2]=color[2];tile.pixels[index+3]=255;
      }else hits++;
      pixels[out]=tile.pixels[index];pixels[out+1]=tile.pixels[index+1];pixels[out+2]=tile.pixels[index+2];
    }
    if(this.tiles.size>64){const oldest=[...this.tiles].sort((a,b)=>a[1].used-b[1].used);for(let i=0;i<oldest.length-64;i++)this.tiles.delete(oldest[i][0]);}
    return {pixels,pending,x:x*step,y:y*step,step,samples,hits,sampleMs,tiles:this.tiles.size};
  }
}
