using System;
using UnityEngine;
namespace CampMind.PixelWorld
{
    /// <summary>Stable identities with different silhouettes, hair, facial features, clothes and accessories.</summary>
    internal static class PixelCompanionArt
    {
        public static readonly string[] Ids={"azhuang","xiaomi","laozhou","linlan","aye","tiesheng","aling","xiaoman","shenyan"};
        static Color32 C(byte r,byte g,byte b)=>new Color32(r,g,b,255);
        static readonly Color32 Ink=C(39,37,38),Hair=C(57,43,37),Skin=C(222,170,120);
        static readonly Color32[] Coats={C(184,121,54),C(74,133,153),C(128,93,66),C(87,117,85),C(74,116,145),C(118,124,116),C(137,94,157),C(128,150,76),C(79,112,140)};
        public static PixelCanvas Draw(string id,int direction,int frame,bool moving)
        {
            int index=Array.IndexOf(Ids,id);if(index<0)index=0;
            var p=new PixelCanvas(64,72);bool back=direction==2,side=direction==1;
            int bob=moving&&frame%2==1?-1:0,step=moving?(frame%2==0?2:-2):0;
            int width=index==0||index==5?30:index==2?27:index==7?21:24,left=32-width/2;
            Color32 skin=index==2?C(172,119,80):index==5?C(195,144,102):Skin,coat=Coats[index],hair=index==1||index==3?C(39,54,63):index==2?C(115,106,91):Hair;
            p.Ellipse(32,67,24,4,new Color32(24,35,28,80));
            p.Rect(21,55+step,9,11,Ink);p.Rect(35,55-step,9,11,Ink);
            p.Rect(23,55+step,5,8,C(72,64,58));p.Rect(37,55-step,5,8,C(72,64,58));
            p.Rect(left-2,33+bob,width+4,25,Ink);p.Rect(left,34+bob,width,21,coat);
            p.Rect(left-7,36+bob,7,15,Ink);p.Rect(left+width,36+bob,7,15,Ink);
            p.Rect(left-5,38+bob,5,11,skin);p.Rect(left+width,38+bob,5,11,skin);
            p.Rect(left,52+bob,width,4,C(77,57,41));p.Rect(29,52+bob,6,4,C(211,170,85));
            p.Ellipse(32,23+bob,17,18,Ink);p.Ellipse(32,23+bob,15,16,skin);
            p.Poly(hair,16,22+bob,16,9+bob,24,3+bob,42,5+bob,49,14+bob,47,24+bob,42,16+bob,34,16+bob,28,12+bob,23,21+bob);
            if(back){p.Ellipse(32,22+bob,15,16,hair);p.Rect(26,39+bob,12,16,C(104,79,51));}
            else{
                p.Rect(side?39:23,24+bob,3,3,Ink);if(!side)p.Rect(39,24+bob,3,3,Ink);
                p.Line(30,34+bob,35,34+bob,C(149,86,66));
            }
            switch(index){
                case 0:p.Rect(19,17+bob,27,4,C(169,65,40));p.Rect(17,40+bob,30,4,C(211,161,77));break;
                case 1:p.Ellipse(18,28+bob,5,12,hair);p.Ellipse(46,28+bob,5,12,hair);p.Rect(13,17+bob,7,5,C(109,188,201));p.Line(27,38+bob,36,49+bob,C(221,213,166));break;
                case 2:if(!back)p.Poly(C(127,116,97),20,30+bob,26,35+bob,39,34+bob,44,29+bob,40,42+bob,29,46+bob);p.Rect(left+3,40+bob,7,13,C(83,61,47));break;
                case 3:p.Poly(hair,14,10+bob,23,3+bob,30,7+bob,35,0+bob,42,8+bob,48,5+bob,51,21+bob,35,15+bob);p.Rect(28,37+bob,8,12,C(158,85,69));break;
                case 4:p.Ellipse(32,15+bob,28,7,Ink);p.Ellipse(32,13+bob,26,6,C(211,181,109));p.Poly(C(192,153,78),12,12+bob,23,1+bob,39,1+bob,53,12+bob);p.Rect(24,44+bob,15,12,C(103,74,46));break;
                case 5:p.Rect(16,8+bob,32,10,C(87,85,77));p.Rect(16,15+bob,32,4,C(168,160,130));p.Rect(left+5,38+bob,width-10,17,C(77,72,65));p.Rect(left+5,34+bob,4,13,C(77,72,65));p.Rect(left+width-9,34+bob,4,13,C(77,72,65));break;
                case 6:p.Ellipse(16,13+bob,7,8,Ink);p.Ellipse(48,13+bob,7,8,Ink);p.Rect(11,16+bob,8,4,C(179,113,164));p.Rect(45,16+bob,8,4,C(179,113,164));p.Poly(C(219,190,162),23,38+bob,39,38+bob,43,56+bob,20,56+bob);break;
                case 7:p.Poly(C(148,177,87),17,10+bob,11,2+bob,27,8+bob,35,8+bob,51,2+bob,46,14+bob);p.Rect(28,38+bob,8,6,C(223,182,92));p.Rect(39,46+bob,9,10,C(123,83,49));break;
                case 8:if(!back){p.Rect(20,22+bob,11,9,Ink);p.Rect(35,22+bob,11,9,Ink);p.Rect(22,24+bob,7,5,C(167,196,187));p.Rect(37,24+bob,7,5,C(167,196,187));p.Line(31,25+bob,35,25+bob,Ink);}p.Rect(25,37+bob,5,16,C(181,198,184));p.Rect(36,46+bob,12,10,C(177,143,90));break;
            }
            return p;
        }
    }
}
