using System;
using System.Collections.Generic;
using UnityEngine;

namespace CampMind.PixelWorld
{
    /// <summary>显式引用素材；发布包不依赖Editor或磁盘上的ThirdParty目录。</summary>
    public sealed class TinySwordsLibrary:ScriptableObject
    {
        [Serializable] public sealed class Entry { public string kind; public Texture2D texture; public int frames=1;public int cropX,cropY,cropWidth,cropHeight; }
        public Texture2D[] terrain;
        public Entry[] entries;
        readonly Dictionary<string,Sprite[]> sprites=new Dictionary<string,Sprite[]>();
        readonly List<Texture2D> derived=new List<Texture2D>();
        Color32[][] groundPixels;
        public Sprite Get(string kind,int frame=0)
        {
            if(!sprites.TryGetValue(kind,out var frames)){
                var entry=Array.Find(entries,e=>e.kind==kind);
                if(entry?.texture==null)return null;
                var t=entry.texture;
                int regionWidth=entry.cropWidth>0?entry.cropWidth:t.width,h=entry.cropHeight>0?entry.cropHeight:t.height;
                int ox=entry.cropX,oy=entry.cropHeight>0?t.height-entry.cropY-entry.cropHeight:0;
                int w=regionWidth/Math.Max(1,entry.frames);frames=new Sprite[entry.frames];
                // 各帧共用包围盒，避免动画脚底漂移；不把整张动画条当成精灵。
                int left=w,right=0,bottom=h,top=0;var pixels=t.GetPixels32();
                for(int y=0;y<h;y++)for(int x=0;x<regionWidth;x++)if(pixels[(oy+y)*t.width+ox+x].a>32){left=Math.Min(left,x%w);right=Math.Max(right,x%w);bottom=Math.Min(bottom,y);top=Math.Max(top,y);}
                if(left>right)return null;
                for(int i=0;i<frames.Length;i++){
                    frames[i]=Sprite.Create(t,new Rect(ox+i*w+left,oy+bottom,right-left+1,top-bottom+1),new Vector2(.5f,0),8,0,SpriteMeshType.FullRect);
                    frames[i].name="TinySwords/"+kind+"/"+i;
                }
                sprites.Add(kind,frames);
            }
            return frames[Math.Abs(frame)%frames.Length];
        }
        public Color32 Grass(int variant,int x,int y)
        {
            if(groundPixels==null){groundPixels=new Color32[terrain.Length][];for(int i=0;i<terrain.Length;i++)groundPixels[i]=terrain[i].GetPixels32();}
            int index=Math.Min(variant,terrain.Length-1);var t=terrain[index];
            return groundPixels[index][(t.height-1-64-(y&63))*t.width+64+(x&63)];
        }
        public Color32 Shore(int col,int row,int x,int y)
        {
            if(groundPixels==null)Grass(0,0,0);
            var t=terrain[0];return groundPixels[0][(t.height-1-row*64-y)*t.width+col*64+x];
        }
        void OnDisable(){foreach(var frames in sprites.Values)foreach(var s in frames)PixelArtLibrary.Release(s);foreach(var t in derived)PixelArtLibrary.Release(t);derived.Clear();sprites.Clear();groundPixels=null;}
    }
}
