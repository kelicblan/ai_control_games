using System.Collections.Generic;
using System.Linq;
using UnityEngine;
namespace CampMind.PixelWorld
{
    /// <summary>Composite the authoritative map's cartographic props using the same sprites as detailed chunks.</summary>
    public sealed class PixelOverviewPainter
    {
        readonly Dictionary<Sprite,Color32[]> crops=new Dictionary<Sprite,Color32[]>();
        public void Paint(Color32[] target,PixelRaster data,PixelArtLibrary art)
        {
            if(art.Tiny!=null&&data.span>0&&data.pixels?.Length==data.size*data.size)for(int row=0;row<data.size;row++)for(int col=0;col<data.size;col++){
                int index=data.pixels[row*data.size+col],wx=(int)((data.x+(col+.5f)*data.metresPerPixel)*8),wy=(int)((data.y+(row+.5f)*data.metresPerPixel)*8);
                int variant=index==1||index==2?1:index==3||index==8?2:0;
                // Avoid phase locking a 64px tile to power-of-two distant sampling intervals.
                var grass=Color32.Lerp(art.Tiny.Grass(variant,wx+col*13+row*7,wy+col*7+row*19),variant==1?new Color32(99,134,71,255):new Color32(114,149,78,255),.28f);var c=grass;
                int n=(int)((uint)(wx*73856093^wy*19349663)%7)-3;
                if(index==5)c=new Color32((byte)(61+n/3),(byte)(133+n/2),(byte)(153+n),255);
                else if(index==6||index==7){float shade=(grass.g-130)/4f;c=new Color32((byte)Mathf.Clamp(185+shade+n,0,255),(byte)Mathf.Clamp(162+shade+n,0,255),(byte)Mathf.Clamp(109+shade+n,0,255),255);}
                else if(index==4||index==9)c=Color32.Lerp(grass,index==9?new Color32(218,230,218,255):new Color32(106,132,124,255),.82f);
                target[(data.size-1-row)*data.size+col]=c;
            }
            if(data.props==null||data.metresPerPixel<=0)return;
            foreach(var p in data.props.OrderBy(p=>p.mapLayer).ThenBy(p=>p.y)){
                var kind=p.kind=="fence"&&p.depth>p.width?"fence-side":p.kind;
                var sprite=art.Get(kind);if(sprite==null)continue;
                if(!crops.TryGetValue(sprite,out var source)){var pixels=sprite.texture.GetPixels((int)sprite.rect.x,(int)sprite.rect.y,(int)sprite.rect.width,(int)sprite.rect.height);source=new Color32[pixels.Length];for(int i=0;i<pixels.Length;i++)source[i]=pixels[i];crops.Add(sprite,source);}
                float width=p.visualWidth>0?p.visualWidth:p.width>0?p.width:kind=="pine"?6:kind=="oak"?8:3;
                float w=width/data.metresPerPixel,h=w*sprite.rect.height/sprite.rect.width/PixelProtocol.WorldYScale;
                if(kind.StartsWith("bridge-"))h=p.depth/data.metresPerPixel;
                if(w<.35f||h<.35f)continue;
                if(kind.StartsWith("bridge-")&&p.angle!=0){Bridge(target,data,p,source,(int)sprite.rect.width,(int)sprite.rect.height,w,h);continue;}
                int left=Mathf.FloorToInt((p.x-data.x)/data.metresPerPixel-w*.5f);
                // Source pivot is measured upward from the feet.
                int top=Mathf.FloorToInt((p.y+p.depth*.5f-data.y)/data.metresPerPixel-h*(1-sprite.pivot.y/sprite.rect.height));
                int iw=Mathf.Max(1,Mathf.CeilToInt(w)),ih=Mathf.Max(1,Mathf.CeilToInt(h));
                for(int row=Mathf.Max(0,-top);row<ih&&top+row<data.size;row++)for(int col=Mathf.Max(0,-left);col<iw&&left+col<data.size;col++){
                    int sx=Mathf.Min((int)sprite.rect.width-1,(int)(col/Mathf.Max(1,w)*sprite.rect.width));
                    int sy=Mathf.Max(0,(int)sprite.rect.height-1-(int)(row/Mathf.Max(1,h)*sprite.rect.height));
                    var c=source[sy*(int)sprite.rect.width+sx];if(c.a==0)continue;
                    int index=(data.size-1-top-row)*data.size+left+col;var b=target[index];int a=c.a;
                    target[index]=new Color32((byte)((c.r*a+b.r*(255-a))/255),(byte)((c.g*a+b.g*(255-a))/255),(byte)((c.b*a+b.b*(255-a))/255),255);
                }
            }
        }
        static void Bridge(Color32[] target,PixelRaster data,PixelProp prop,Color32[] source,int sw,int sh,float w,float h)
        {
            float cx=(prop.x-data.x)/data.metresPerPixel,cy=(prop.y-data.y)/data.metresPerPixel,c=Mathf.Cos(prop.angle),s=Mathf.Sin(prop.angle);
            float bw=Mathf.Abs(w*c)+Mathf.Abs(h*s),bh=Mathf.Abs(w*s)+Mathf.Abs(h*c);
            int left=Mathf.Max(0,Mathf.FloorToInt(cx-bw/2)),right=Mathf.Min(data.size,Mathf.CeilToInt(cx+bw/2)),top=Mathf.Max(0,Mathf.FloorToInt(cy-bh/2)),bottom=Mathf.Min(data.size,Mathf.CeilToInt(cy+bh/2));
            for(int y=top;y<bottom;y++)for(int x=left;x<right;x++){
                float dx=x+.5f-cx,dy=y+.5f-cy,u=(dx*c+dy*s)/w+.5f,v=(-dx*s+dy*c)/h+.5f;
                if(u<0||u>=1||v<0||v>=1)continue;
                var color=source[Mathf.Clamp((int)((1-v)*sh),0,sh-1)*sw+Mathf.Clamp((int)(u*sw),0,sw-1)];if(color.a==0)continue;
                int index=(data.size-1-y)*data.size+x;var b=target[index];int a=color.a;
                target[index]=new Color32((byte)((color.r*a+b.r*(255-a))/255),(byte)((color.g*a+b.g*(255-a))/255),(byte)((color.b*a+b.b*(255-a))/255),255);
            }
        }
    }
}
