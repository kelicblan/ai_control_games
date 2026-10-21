using System;
using System.Collections.Generic;
using UnityEngine;
namespace CampMind.PixelWorld
{
    /// <summary>原创程序化像素首版素材。后续可逐种替换成正式精灵，不改变世界坐标、碰撞或资源ID。</summary>
    public sealed class PixelArtLibrary:IDisposable
    {
        readonly Dictionary<string,Sprite> sprites=new Dictionary<string,Sprite>();
        readonly List<Texture2D> textures=new List<Texture2D>();
        static readonly Color32 Ink=C(37,42,31),Wood=C(125,78,44),LightWood=C(190,142,78),Stone=C(113,121,114);
        static Color32 C(byte r,byte g,byte b,byte a=255)=>new Color32(r,g,b,a);
        public Sprite Get(string kind)
        {
            if(sprites.TryGetValue(kind,out var found))return found;
            PixelCanvas p;
            if(kind.StartsWith("lord-"))p=Person(kind);
            else switch(kind){
                case "hall":case "house":case "workshop":case "storehouse":p=Building(kind);break;
                case "pine":case "oak":p=Tree(kind);break;
                case "gate-open":case "gate-closed":p=Gate(kind=="gate-open");break;
                case "fence":case "fence-side":p=Fence(kind=="fence-side");break;
                case "goldmine":case "ruins":p=Mine(kind=="goldmine");break;
                case "tower":p=Tower();break;
                case "bridge-horizontal":case "bridge-vertical":p=Bridge(kind=="bridge-horizontal");break;
                default:p=Small(kind);break;
            }
            var texture=p.Texture();texture.name="pixel-"+kind;textures.Add(texture);
            var sprite=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,0),8,0,SpriteMeshType.FullRect);
            sprite.name=kind;sprites.Add(kind,sprite);return sprite;
        }
        static PixelCanvas Building(string kind)
        {
            var p=new PixelCanvas(112,94);var roof=kind=="hall"?C(69,88,101):C(169,132,66);var light=kind=="hall"?C(117,140,148):C(219,183,102);
            p.Ellipse(58,83,49,8,C(25,39,22,70));p.Rect(9,73,91,12,Ink);p.Rect(12,74,85,8,Stone);
            for(int x=14;x<96;x+=11){p.Line(x,75,x,81,C(75,82,75));p.Line(x+1,74,x+9,74,C(157,160,143));}
            p.Rect(15,39,80,36,Ink);p.Rect(19,41,72,31,C(179,145,96));
            p.Poly(C(117,79,49),90,40,103,34,103,68,90,75);p.Line(103,34,103,68,Ink);
            for(int x=19;x<=91;x+=18)p.Rect(x,41,3,34,Wood);
            p.Rect(17,48,76,3,Wood);p.Rect(17,69,77,3,Wood);
            if(kind=="workshop"){
                p.Rect(24,49,62,23,C(47,48,34));p.Rect(26,61,57,5,LightWood);p.Rect(29,66,3,8,Wood);p.Rect(77,66,3,8,Wood);
                p.Line(39,51,39,60,Stone);p.Rect(35,50,10,3,Stone);p.Line(58,52,62,60,LightWood);p.Line(68,51,75,58,Stone);
            }else{
                p.Rect(44,50,23,25,Ink);p.Rect(47,52,17,23,Wood);p.Line(55,52,55,74,Ink);p.Put(53,63,LightWood);p.Put(58,63,LightWood);
                foreach(int x in new[]{25,75}){p.Rect(x,52,12,12,Wood);p.Rect(x+2,54,8,8,C(48,62,52));p.Line(x+6,54,x+6,61,LightWood);}
            }
            p.Poly(Ink,3,38,42,8,83,8,109,35,94,47,15,47);
            p.Poly(roof,7,37,43,11,81,11,103,35,92,43,16,43);
            for(int y=17;y<=40;y+=5){int left=39-(y-17);p.Line(Math.Max(10,left),y,82+(y-17)/2,y,light);}
            for(int x=20;x<96;x+=8)p.Line(48+(x-48)/3,13,x,41,kind=="hall"?C(48,67,83):C(131,98,51));
            p.Line(43,10,81,10,LightWood);p.Rect(9,43,87,3,Wood);
            if(kind=="hall"){
                p.Line(5,34,5,40,Wood);p.Line(104,32,104,39,Wood);p.Rect(42,43,28,5,C(50,64,51));
                p.Rect(39,79,33,4,C(163,162,143));p.Rect(35,83,41,4,Stone);p.Rect(31,87,49,3,C(143,147,132));
            }
            if(kind=="storehouse"){
                p.Rect(20,66,18,10,Wood);p.Line(20,66,38,76,LightWood);p.Line(38,66,20,76,LightWood);
                p.Ellipse(85,77,7,6,C(193,165,105));p.Line(81,72,89,72,Wood);
            }
            if(kind=="house"){p.Rect(89,68,10,12,Wood);p.Line(89,69,99,79,LightWood);p.Rect(11,62,3,16,Wood);}
            return p;
        }
        static PixelCanvas Tree(string kind)
        {
            var p=new PixelCanvas(64,82);p.Ellipse(32,77,21,4,C(20,38,22,64));
            p.Rect(28,43,9,34,Ink);p.Rect(30,43,5,34,Wood);p.Line(31,66,20,54,Wood);p.Line(33,59,45,47,Wood);
            if(kind=="pine"){
                for(int row=0;row<5;row++){
                    int top=2+row*10,bottom=28+row*10,half=10+row*4;
                    p.Poly(Ink,32,top,32-half,bottom,32,bottom-3,32+half,bottom);
                    p.Poly(C((byte)(48+row*3),(byte)(96+row*4),51),32,top+3,34-half,bottom-3,32,bottom-6,30+half,bottom-3);
                    p.Line(32,top+5,35-half,bottom-5,C(91,135,61));
                }
            }else{
                var rng=new System.Random(851);
                for(int i=0;i<20;i++){
                    int x=14+rng.Next(37),y=15+rng.Next(33),r=8+rng.Next(7);
                    p.Ellipse(x,y,r,r-2,Ink);p.Ellipse(x,y-1,r-2,r-4,C(67,110,49));
                    p.Ellipse(x-2,y-4,r/2,r/3,C(111,153,66));
                }
            }
            p.Grain(13,6);return p;
        }
        static PixelCanvas Fence(bool side)
        {
            var p=new PixelCanvas(side?18:32,48);
            p.Rect(1,27,p.Width-2,5,Wood);p.Rect(1,38,p.Width-2,4,Wood);
            for(int x=3;x<p.Width;x+=10){p.Rect(x,14,7,32,Ink);p.Rect(x+1,15,4,29,LightWood);p.Poly(LightWood,x+1,15,x+3,11,x+5,15);p.Line(x+5,17,x+5,43,Wood);}
            return p;
        }
        static PixelCanvas Gate(bool open)
        {
            var p=new PixelCanvas(112,70);p.Ellipse(56,66,50,4,C(20,30,17,60));
            foreach(int x in new[]{4,96}){p.Rect(x,13,12,54,Ink);p.Rect(x+2,14,7,50,Wood);p.Line(x+3,15,x+3,62,LightWood);}
            p.Rect(3,10,105,8,Ink);p.Rect(5,11,101,5,Wood);p.Line(7,11,103,11,LightWood);
            if(open){
                p.Poly(Wood,17,23,2,32,2,59,17,65);p.Poly(Wood,95,23,110,32,110,59,95,65);
                p.Line(8,32,8,59,LightWood);p.Line(104,32,104,59,LightWood);
            }else{
                p.Rect(16,22,80,44,Ink);p.Rect(18,24,76,39,Wood);
                for(int x=21;x<93;x+=7)p.Line(x,24,x,62,LightWood);
                p.Rect(18,35,76,3,C(75,57,39));p.Rect(18,55,76,3,C(75,57,39));p.Line(56,24,56,63,Ink);
            }
            return p;
        }
        static PixelCanvas Bridge(bool horizontal)
        {
            var p=new PixelCanvas(horizontal?64:96,horizontal?112:32);
            p.Rect(0,0,p.Width,p.Height,Wood);
            if(horizontal){for(int x=0;x<p.Width;x+=8){p.Rect(x+1,2,6,p.Height-4,LightWood);p.Put(x+3,8,Ink);p.Put(x+3,p.Height-9,Ink);}p.Rect(0,1,p.Width,3,Ink);p.Rect(0,p.Height-4,p.Width,3,Ink);}
            else{for(int y=0;y<p.Height;y+=4)p.Rect(2,y+1,p.Width-4,3,LightWood);p.Rect(1,0,3,p.Height,Ink);p.Rect(p.Width-4,0,3,p.Height,Ink);}
            return p;
        }
        static PixelCanvas Tower()
        {
            var p=new PixelCanvas(48,88);p.Ellipse(24,83,19,4,C(20,35,20,70));
            foreach(int x in new[]{8,35}){p.Rect(x,30,5,54,Ink);p.Rect(x+1,31,2,52,Wood);}
            p.Line(11,49,37,79,LightWood);p.Line(37,49,11,79,LightWood);p.Rect(7,34,33,7,Wood);
            p.Rect(9,21,29,15,C(172,127,68));p.Rect(13,23,21,9,C(37,47,37));
            p.Poly(Ink,1,22,23,4,46,22,43,26,4,26);p.Poly(C(75,95,100),5,21,23,8,42,21);p.Line(6,22,41,22,LightWood);
            for(int y=47;y<81;y+=6)p.Line(21,y,29,y,LightWood);p.Line(21,43,21,83,Wood);p.Line(29,43,29,83,Wood);return p;
        }
        static PixelCanvas Mine(bool gold)
        {
            var p=new PixelCanvas(112,84);p.Ellipse(57,76,52,7,C(25,35,26,70));
            p.Poly(Ink,3,73,12,35,28,21,34,5,69,9,92,29,109,72);
            p.Poly(C(94,103,98),7,70,17,36,33,26,38,10,66,14,87,33,104,70);
            p.Poly(C(143,148,132),17,36,38,10,48,27,34,52);p.Poly(C(65,77,73),69,17,85,34,100,66,75,58);
            p.Rect(40,38,32,36,C(23,34,30));p.Rect(36,34,5,42,Wood);p.Rect(72,34,5,42,Wood);p.Rect(35,32,43,6,LightWood);
            p.Line(44,73,34,82,Stone);p.Line(67,73,78,82,Stone);
            if(gold)foreach(var q in new[]{new Vector2Int(22,47),new Vector2Int(84,49),new Vector2Int(29,64)}){p.Poly(C(218,165,52),q.x,q.y,q.x+7,q.y-3,q.x+9,q.y+3,q.x+3,q.y+7);p.Put(q.x+3,q.y,C(255,226,113));}
            return p;
        }
        static PixelCanvas Small(string kind)
        {
            var p=new PixelCanvas(40,42);p.Ellipse(20,37,16,4,C(28,45,24,60));
            if(kind=="depleted")return new PixelCanvas(8,8);
            if(kind=="rock"||kind=="goldore"){
                p.Poly(Ink,4,33,8,16,20,7,32,17,37,33,29,38,12,38);p.Poly(Stone,7,31,11,18,20,11,29,19,33,32,27,35,13,35);
                p.Poly(C(159,163,145),11,19,20,11,23,23,15,28);p.Line(23,23,29,19,C(75,83,77));
                if(kind=="goldore"){p.Rect(15,19,4,5,C(237,188,58));p.Rect(25,28,5,4,C(222,158,41));}
            }else if(kind=="well"){
                p.Ellipse(20,31,15,7,Ink);p.Rect(6,23,29,10,Stone);p.Ellipse(20,23,15,6,C(163,166,143));p.Ellipse(20,23,10,3,C(46,92,106));
                p.Rect(7,7,3,20,Wood);p.Rect(30,7,3,20,Wood);p.Rect(7,6,26,3,LightWood);p.Line(21,9,21,25,LightWood);
            }else if(kind=="fire"){
                for(int i=0;i<8;i++){float a=i*Mathf.PI/4;p.Ellipse(20+(int)(Mathf.Cos(a)*13),31+(int)(Mathf.Sin(a)*5),4,3,Stone);}
                p.Line(12,34,28,28,Wood);p.Line(12,28,28,34,Wood);p.Poly(C(209,91,32),12,29,17,13,21,19,24,6,30,28,21,34);p.Poly(C(255,193,61),17,29,21,19,22,26,26,18,26,30,21,32);
            }else if(kind=="stump"){p.Rect(15,25,11,11,Wood);p.Ellipse(20,25,8,3,LightWood);p.Ellipse(20,25,4,1,Wood);}
            else{
                for(int i=0;i<7;i++){int x=7+i*4,y=26+(i%3)*3;p.Line(x,36,x-3,y-10,C(58,102,47));p.Line(x,35,x+3,y-13,C(127,153,65));}
                if(kind=="berry")for(int i=0;i<9;i++){int x=8+(i*7)%25,y=19+(i*5)%14;p.Ellipse(x,y,4,3,C(51,98,45));p.Rect(x,y,2,2,C(179,64,61));}
            }
            return p;
        }
        static PixelCanvas Person(string kind)
        {
            var p=new PixelCanvas(20,34);bool back=kind.Contains("back"),side=kind.Contains("side"),step=kind.EndsWith("1");
            p.Ellipse(10,32,7,1,C(24,34,23,80));p.Rect(step?5:7,26,4,6,Ink);p.Rect(step?12:11,27,4,5,Ink);
            p.Rect(6,13,9,14,Ink);p.Rect(7,14,7,12,C(90,113,78));p.Rect(7,23,7,2,C(204,165,78));
            p.Rect(4,15,3,9,C(154,111,71));p.Rect(15,16,2,8,C(154,111,71));
            p.Rect(6,4,9,10,Ink);p.Rect(8,7,6,6,C(210,164,105));p.Rect(6,4,9,4,C(62,43,30));p.Rect(9,1,4,4,Ink);
            if(back)p.Rect(7,7,7,6,C(62,43,30));else if(side){p.Rect(13,8,3,3,C(210,164,105));p.Put(13,8,Ink);}else{p.Put(9,9,Ink);p.Put(13,9,Ink);}
            return p;
        }
        public void Dispose(){foreach(var sprite in sprites.Values)Release(sprite);foreach(var texture in textures)Release(texture);sprites.Clear();textures.Clear();}
        public static void Release(UnityEngine.Object value){if(value==null)return;if(Application.isPlaying)UnityEngine.Object.Destroy(value);else UnityEngine.Object.DestroyImmediate(value);}
    }
    internal sealed class PixelCanvas
    {
        public readonly int Width,Height;
        readonly Color32[] pixels;
        public PixelCanvas(int width,int height){Width=width;Height=height;pixels=new Color32[width*height];}
        public void Put(int x,int y,Color32 color){if(x>=0&&y>=0&&x<Width&&y<Height)pixels[(Height-1-y)*Width+x]=color;}
        public void Rect(int x,int y,int w,int h,Color32 c){for(int row=y;row<y+h;row++)for(int col=x;col<x+w;col++)Put(col,row,c);}
        public void Line(int x,int y,int tx,int ty,Color32 c){int dx=Math.Abs(tx-x),sx=x<tx?1:-1,dy=-Math.Abs(ty-y),sy=y<ty?1:-1,err=dx+dy;while(true){Put(x,y,c);if(x==tx&&y==ty)break;int e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}}
        public void Ellipse(int cx,int cy,int rx,int ry,Color32 c){for(int y=-ry;y<=ry;y++)for(int x=-rx;x<=rx;x++)if(x*x/(float)(rx*rx)+y*y/(float)Math.Max(1,ry*ry)<=1)Put(cx+x,cy+y,c);}
        public void Poly(Color32 color,params int[] xy){
            for(int y=0;y<Height;y++)for(int x=0;x<Width;x++){
                bool inside=false;for(int i=0,j=xy.Length-2;i<xy.Length;j=i,i+=2){int ax=xy[i],ay=xy[i+1],bx=xy[j],by=xy[j+1];if((ay>y)!=(by>y)&&x<(bx-ax)*(y-ay)/(float)(by-ay)+ax)inside=!inside;}
                if(inside)Put(x,y,color);
            }
        }
        public void Grain(int seed,int strength){for(int i=0;i<pixels.Length;i++){var c=pixels[i];if(c.a==0)continue;int n=((i*7919+seed*13)&15)-8;c.r=(byte)Mathf.Clamp(c.r+n*strength/8,0,255);c.g=(byte)Mathf.Clamp(c.g+n*strength/8,0,255);c.b=(byte)Mathf.Clamp(c.b+n*strength/8,0,255);pixels[i]=c;}}
        public Texture2D Texture(){var t=new Texture2D(Width,Height,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};t.SetPixels32(pixels);t.Apply(false,false);return t;}
    }
}
