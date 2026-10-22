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
        public TinySwordsLibrary Tiny {get;}=Resources.Load<TinySwordsLibrary>("PixelWorld/TinySwords");
        static readonly Color32 Ink=C(37,42,31),Wood=C(125,78,44),LightWood=C(190,142,78),Stone=C(113,121,114);
        static Color32 C(byte r,byte g,byte b,byte a=255)=>new Color32(r,g,b,a);
        public Sprite Get(string kind)
        {
            var imported=Tiny?.Get(kind);if(imported!=null)return imported;
            if(sprites.TryGetValue(kind,out var found))return found;
            PixelCanvas p;
            if(kind.StartsWith("lord-"))p=Person(kind);
            else if(kind.StartsWith("animal-"))p=Animal(kind.Substring(7));
            else switch(kind){
                case "hall":case "house":case "workshop":case "storehouse":p=Building(kind);break;
                case "pine":case "oak":p=Tree(kind);break;
                case "gate-open":case "gate-closed":p=Gate(kind=="gate-open");break;
                case "fence":case "fence-side":p=Fence(kind=="fence-side");break;
                case "goldmine":case "ruins":p=Mine(kind=="goldmine");break;
                case "tower":p=Tower();break;
                case "mountain-peak":case "snow-peak":p=Mountain(kind=="snow-peak");break;
                case "garden":case "flowers":case "woodpile":case "crate":case "bench":case "lantern":case "banner":case "gate-shutter":p=Detail(kind);break;
                case "bridge-horizontal":case "bridge-vertical":p=Bridge(kind=="bridge-horizontal");break;
                default:p=Small(kind);break;
            }
            var texture=p.Texture();texture.name="pixel-"+kind;textures.Add(texture);
            var sprite=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,0),8,0,SpriteMeshType.FullRect);
            sprite.name=kind;sprites.Add(kind,sprite);return sprite;
        }
        public Sprite Actor(bool moving,int frame)=>Tiny?.Get(moving?"lord-run":"lord-idle",frame)??Get("lord-front-"+(frame%2));
        public Sprite Companion(string id,int direction,bool moving,int frame)
        {
            string key=$"companion-{id}-{direction}-{moving}-{frame%2}";if(sprites.TryGetValue(key,out var cached))return cached;
            var texture=PixelCompanionArt.Draw(id,direction,frame,moving).Texture();texture.name=key;textures.Add(texture);
            var sprite=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,0),8,0,SpriteMeshType.FullRect);sprite.name=key;sprites.Add(key,sprite);return sprite;
        }
        public Sprite Wildlife(string species,int frame)
        {
            string key=$"wildlife-{species}-{frame%2}";if(sprites.TryGetValue(key,out var cached))return cached;
            var texture=PixelAnimalArt.Draw(species,frame).Texture();textures.Add(texture);
            var sprite=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,0),8,0,SpriteMeshType.FullRect);sprite.name=key;sprites.Add(key,sprite);return sprite;
        }
        static PixelCanvas Animal(string species){
            var p=new PixelCanvas(64,48);var fur=species=="tiger"?C(205,142,53):species=="bear"?C(96,72,53):species=="rabbit"?C(218,206,167):species=="deer"?C(156,111,62):C(123,101,76);
            p.Ellipse(32,42,27,5,C(25,40,25,90));p.Ellipse(29,26,21,12,Ink);p.Ellipse(29,25,19,10,fur);p.Rect(16,29,5,13,Ink);p.Rect(38,29,5,13,Ink);p.Rect(17,29,3,11,fur);p.Rect(39,29,3,11,fur);p.Ellipse(48,20,10,10,Ink);p.Ellipse(48,19,8,8,fur);p.Rect(50,16,2,2,Ink);
            if(species=="rabbit"){p.Rect(43,1,4,14,Ink);p.Rect(50,3,4,12,Ink);p.Rect(44,2,2,12,fur);}
            else if(species=="deer"){p.Line(44,10,41,1,Ink);p.Line(50,10,54,1,Ink);p.Line(42,5,38,2,Ink);}
            else if(species=="tiger")for(int i=0;i<4;i++)p.Line(18+i*7,17,20+i*7,26,Ink);
            else if(species=="pheasant"){p.Poly(C(61,106,75),5,26,2,9,21,22);p.Rect(45,7,7,5,C(171,57,45));}
            else {p.Rect(43,8,4,6,Ink);p.Rect(51,8,4,6,Ink);}return p;
        }
        internal static PixelCanvas Mountain(bool snow)
        {
            var p=new PixelCanvas(160,154);
            p.Ellipse(80,137,76,15,C(35,60,53,90));
            p.Poly(C(42,67,69),3,135,22,80,39,62,52,24,76,6,91,40,113,51,135,96,157,137,117,149,40,149);
            p.Poly(C(99,132,131),8,130,28,81,45,66,57,28,75,13,87,45,108,55,128,98,149,134,115,143,43,143);
            p.Poly(C(147,168,155),28,81,57,28,75,13,69,70,47,105,43,139,12,130);
            p.Poly(C(63,96,100),75,13,87,45,108,55,128,98,149,134,112,142,83,93,69,70);
            p.Poly(C(121,151,141),108,55,106,90,118,118,149,134,128,98);
            p.Line(57,32,48,70,C(184,192,166));p.Line(48,70,33,96,C(184,192,166));p.Line(84,51,79,86,C(45,74,78));p.Line(79,86,93,117,C(45,74,78));
            for(int i=0;i<11;i++){int x=13+i*13,y=128+i%3*5;p.Poly(C(80,114,95),x,y,x+5,y-8,x+11,y,x+8,y+5,x+2,y+5);}
            if(snow){p.Poly(C(224,237,221),48,59,57,28,75,13,87,45,95,48,87,61,77,49,66,67,61,54);p.Poly(C(171,202,197),75,13,87,45,95,48,87,61,77,49,70,55);}
            return p;
        }
        static PixelCanvas Detail(string kind)
        {
            var p=new PixelCanvas(96,64);
            if(kind=="gate-shutter"){
                p.Rect(0,0,96,64,Ink);p.Rect(3,1,90,61,Wood);for(int x=6;x<94;x+=9){p.Line(x,1,x,61,LightWood);p.Line(x+2,2,x+2,60,C(94,63,40));}
                p.Rect(4,17,88,6,LightWood);p.Rect(4,49,88,6,LightWood);p.Line(4,22,44,49,LightWood);p.Line(52,49,92,22,LightWood);p.Line(48,1,48,63,Ink);
            }else if(kind=="garden"){
                p.Ellipse(48,45,46,15,C(104,133,67));
                for(int i=0;i<32;i++){int x=7+i*23%82,y=35+i*11%20;p.Line(x,y,x+2,y-7,C(73,112,49));p.Line(x,y,x-3,y-4,C(162,178,84));}
                for(int i=0;i<12;i++)p.Ellipse(8+i*7,55+(i%2)*2,4,2,Stone);
            }else if(kind=="flowers"){
                for(int i=0;i<12;i++){int x=10+i*29%76,y=35+i*7%20;p.Line(x,y,x+1,y-10,C(54,111,59));p.Ellipse(x,y-10,3,2,i%3==0?C(241,204,104):C(213,144,119));p.Put(x,y-10,C(255,236,165));}
            }else if(kind=="woodpile"){
                p.Ellipse(48,54,40,7,C(37,49,37,70));
                for(int row=0;row<3;row++)for(int i=0;i<5-row;i++){int x=10+i*16+row*7,y=50-row*10;p.Rect(x,y-9,25,10,Wood);p.Line(x+2,y-8,x+22,y-8,LightWood);p.Ellipse(x+23,y-4,6,5,C(210,173,109));p.Ellipse(x+23,y-4,3,2,Wood);}
            }else if(kind=="crate"){
                p.Rect(15,17,63,40,Ink);p.Rect(18,20,57,34,Wood);for(int y=23;y<52;y+=8)p.Line(20,y,73,y,LightWood);p.Line(20,22,73,52,LightWood);p.Line(73,22,20,52,LightWood);p.Rect(17,18,59,4,LightWood);
            }else if(kind=="bench"){
                p.Ellipse(48,54,39,5,C(37,49,37,70));p.Rect(17,32,6,23,Wood);p.Rect(73,32,6,23,Wood);p.Rect(9,27,78,10,Ink);p.Rect(10,27,76,6,LightWood);p.Line(12,29,83,29,C(224,181,110));
            }else if(kind=="lantern"){
                p.Rect(44,10,5,50,Wood);p.Rect(38,17,18,23,Ink);p.Rect(40,20,14,17,C(230,164,74));p.Rect(44,20,5,17,C(255,221,121));p.Poly(Stone,34,18,47,9,60,18);p.Rect(40,39,14,3,LightWood);
            }else if(kind=="banner"){
                p.Rect(45,8,5,54,Wood);p.Rect(29,12,37,4,LightWood);p.Poly(C(55,91,104),33,17,62,17,62,47,47,57,33,47);p.Rect(36,18,23,3,C(201,168,85));p.Poly(C(215,184,103),47,25,54,34,47,43,40,34);
            }
            return p;
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
            var p=new PixelCanvas(side?48:32,96);
            if(side){
                p.Poly(C(40,51,39,70),16,35,35,43,35,94,16,86);
                p.Rect(17,29,8,63,Wood);p.Rect(17,29,3,63,LightWood);
                p.Poly(Wood,18,42,34,32,34,39,18,49);p.Poly(Wood,18,76,34,66,34,73,18,83);
                p.Rect(27,7,13,78,Ink);p.Rect(29,9,8,74,LightWood);p.Rect(35,10,3,73,Wood);p.Poly(LightWood,29,9,33,2,37,9);
            }else{
                p.Rect(0,45,32,6,Wood);p.Rect(0,78,32,5,Wood);
                for(int x=0;x<32;x+=8){p.Rect(x,13,8,81,Ink);p.Rect(x+1,14,6,78,LightWood);p.Rect(x+5,16,2,75,Wood);p.Poly(LightWood,x+1,14,x+4,7,x+7,14);p.Line(x+2,19,x+2,87,C(222,182,113));}
                p.Rect(0,46,32,4,C(94,63,40));p.Rect(0,79,32,3,C(94,63,40));
            }
            return p;
        }
        static PixelCanvas Gate(bool open)
        {
            var p=new PixelCanvas(112,96);p.Ellipse(56,86,51,7,C(20,30,17,65));
            foreach(int x in new[]{5,86}){
                p.Rect(x,28,21,60,Ink);p.Rect(x+3,30,15,54,Wood);p.Rect(x+5,30,4,51,LightWood);
                p.Poly(Ink,x-5,29,x+9,12,x+20,12,x+28,29,x+23,35,x-2,35);
                p.Poly(C(69,88,101),x-2,28,x+10,16,x+18,16,x+24,28,x+21,31,x,31);
                p.Line(x+1,28,x+21,28,C(163,179,170));p.Rect(x-1,34,24,4,LightWood);
            }
            p.Rect(23,38,65,9,Ink);p.Rect(24,39,63,5,Wood);p.Rect(40,43,32,13,C(40,67,64));p.Rect(43,46,26,2,LightWood);
            p.Poly(C(215,183,95),54,47,59,51,54,55,49,51);
            if(!open){p.Rect(26,48,60,35,Ink);p.Rect(28,50,56,31,Wood);for(int x=30;x<84;x+=7)p.Line(x,51,x,79,LightWood);p.Rect(28,61,56,3,Ink);p.Line(56,50,56,81,Ink);}
            else{p.Poly(Wood,26,48,15,53,15,84,26,81);p.Poly(Wood,86,48,97,53,97,84,86,81);p.Line(20,52,20,78,LightWood);p.Line(92,52,92,78,LightWood);}
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
