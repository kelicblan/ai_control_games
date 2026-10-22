using UnityEngine;
namespace CampMind.PixelWorld
{
    internal static class PixelAnimalArt
    {
        static Color32 C(byte r,byte g,byte b)=>new Color32(r,g,b,255);
        static readonly Color32 Ink=C(42,39,32);
        public static PixelCanvas Draw(string species,int frame)
        {
            var p=new PixelCanvas(72,64);int leg=frame%2==0?2:-2;
            var fur=species=="tiger"?C(207,143,55):species=="bear"?C(102,76,55):species=="deer"?C(168,120,70):species=="rabbit"?C(225,217,188):C(126,105,83);
            p.Ellipse(34,59,29,4,new Color32(25,39,28,75));
            if(species=="rabbit"){
                p.Ellipse(30,44,22,13,Ink);p.Ellipse(30,43,20,11,fur);p.Ellipse(47,34,13,12,Ink);p.Ellipse(47,33,11,10,fur);
                p.Ellipse(41,15,4,18,Ink);p.Ellipse(52,14,4,18,Ink);p.Ellipse(41,15,2,14,C(195,151,142));p.Ellipse(52,14,2,14,C(195,151,142));
                p.Ellipse(12,42,6,6,C(242,235,211));p.Ellipse(25+leg,55,9,4,fur);p.Ellipse(48-leg,54,7,4,fur);p.Put(52,31,Ink);
            }else if(species=="pheasant"){
                p.Poly(Ink,31,43,4,22,9,48,34,53);p.Poly(C(73,110,84),29,44,8,28,13,47,34,50);
                p.Ellipse(37,43,17,11,Ink);p.Ellipse(37,42,15,9,C(154,109,70));p.Ellipse(51,28,7,14,C(49,105,81));p.Ellipse(52,20,7,7,Ink);p.Ellipse(52,20,5,5,C(173,60,45));p.Rect(55,18,2,2,C(245,222,163));p.Poly(C(211,172,89),57,22,66,25,57,27);
                p.Line(32,51,31+leg,59,C(186,147,65));p.Line(43,51,44-leg,59,C(186,147,65));
            }else{
                bool deer=species=="deer",bear=species=="bear";int y=deer?33:bear?36:40,rx=bear?25:23,ry=bear?18:deer?12:13;
                p.Ellipse(30,y,rx+2,ry+2,Ink);p.Ellipse(30,y-1,rx,ry,fur);
                for(int i=0;i<4;i++){int x=14+i*11,offset=i%2==0?leg:-leg;p.Rect(x,y+6,6,19+offset,Ink);p.Rect(x+1,y+6,4,16+offset,fur);}
                int headY=deer?22:bear?28:34;
                if(deer){p.Poly(fur,44,36,43,19,52,17,57,35);p.Line(47,16,44,2,Ink);p.Line(44,8,37,4,Ink);p.Line(54,16,59,2,Ink);p.Line(57,8,64,5,Ink);}
                p.Ellipse(53,headY,12,11,Ink);p.Ellipse(53,headY-1,10,9,fur);p.Ellipse(62,headY+4,7,5,deer?C(201,169,123):C(155,134,107));p.Rect(57,headY-4,2,3,Ink);
                p.Ellipse(46,headY-10,4,5,Ink);p.Ellipse(59,headY-10,4,5,Ink);
                if(species=="tiger"){for(int i=0;i<5;i++)p.Line(12+i*8,29,15+i*8,43,Ink);p.Line(8,38,2,21,Ink);p.Line(2,21,7,16,Ink);p.Ellipse(53,headY+5,4,4,C(232,213,167));}
                if(species=="boar"){p.Poly(Ink,12,28,20,23,25,28,34,23,42,29);p.Line(60,42,63,35,C(235,221,177));p.Line(65,42,68,36,C(235,221,177));}
                if(deer){for(int i=0;i<6;i++)p.Put(15+i*5,29+i%2*5,C(232,205,157));}
            }
            return p;
        }
    }
}
