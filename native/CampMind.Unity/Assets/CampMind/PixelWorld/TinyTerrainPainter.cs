using UnityEngine;

namespace CampMind.PixelWorld
{
    /// <summary>地形分类来自权威快照；边缘使用带一格halo的采样，跨块不产生接缝。</summary>
    internal static class TinyTerrainPainter
    {
        public const int Size=1024;
        static Color32 Mix(Color32 a,Color32 b,float t)=>Color32.Lerp(a,b,t);
        public static Color32[] Paint(PixelChunk chunk,TinySwordsLibrary art)
        {
            var pixels=new Color32[Size*Size];
            int Tile(int x,int y)=>chunk.halo?.Length==66*66?chunk.halo[(y+1)*66+x+1]:chunk.tiles[Mathf.Clamp(y,0,63)*64+Mathf.Clamp(x,0,63)];
            for(int row=0;row<Size;row++)for(int col=0;col<Size;col++){
                int tx=col/16,ty=row/16,index=Tile(tx,ty),wx=chunk.cx*Size+col,wy=chunk.cy*Size+row;
                int variant=index==1||index==2?1:index==3||index==8?2:0;
                var grass=Mix(art.Grass(variant,wx,wy),variant==1?new Color32(99,134,71,255):new Color32(114,149,78,255),.28f);Color32 c=grass;
                int n=(int)((uint)(wx*73856093^wy*19349663)%11)-5;
                if(index==5){
                    c=new Color32((byte)(61+n/3),(byte)(133+n/2),(byte)(153+n),255);
                }else if(index==6||index==7){
                    float shade=(grass.g-130)/4f;
                    c=new Color32((byte)Mathf.Clamp(185+shade+n,0,255),(byte)Mathf.Clamp(162+shade+n,0,255),(byte)Mathf.Clamp(109+shade+n,0,255),255);
                    if(index==7){
                        int px=col%16,py=row%16;float edge=0;
                        if(Tile(tx-1,ty)!=7)edge=Mathf.Max(edge,1-px/3f);
                        if(Tile(tx+1,ty)!=7)edge=Mathf.Max(edge,(px-12)/3f);
                        if(Tile(tx,ty-1)!=7)edge=Mathf.Max(edge,1-py/3f);
                        if(Tile(tx,ty+1)!=7)edge=Mathf.Max(edge,(py-12)/3f);
                        c=Mix(c,grass,Mathf.Clamp01(edge)*.7f);
                    }
                }else if(index==4||index==9){
                    c=Mix(grass,index==9?new Color32(218,230,218,255):new Color32(106,132,124,255),.82f);
                    if(Tile(tx,ty+1)!=index&&row%16>7)c=Mix(c,new Color32(58,85,85,255),(row%16-7)/12f);
                }
                if(index!=5){
                    bool left=Tile(tx-1,ty)==5,right=Tile(tx+1,ty)==5,up=Tile(tx,ty-1)==5,down=Tile(tx,ty+1)==5;
                    if(left||right||up||down){
                        int sc=left?0:right?2:1,sr=up?0:down?2:1;
                        var shore=art.Shore(sc,sr,(col%16)*4,(row%16)*4);
                        if(shore.a<200)c=Mix(new Color32(111,176,173,255),c,shore.a/255f);
                        else if(col%16<3&&left||col%16>12&&right||row%16<3&&up||row%16>12&&down)c=Mix(c,shore,.6f);
                    }
                }
                pixels[(Size-1-row)*Size+col]=c;
            }
            return pixels;
        }
    }
}
