using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation {
 // Procedural UI geometry: no texture loading, input interception, or authority changes.
 public static class NativeFxGeometry {
  public static void Quad(VertexHelper v,Vector2 a,Vector2 b,Vector2 c,Vector2 d,Color first,Color last){var n=v.currentVertCount;v.AddVert(a,first,Vector2.zero);v.AddVert(b,first,Vector2.zero);v.AddVert(c,last,Vector2.zero);v.AddVert(d,last,Vector2.zero);v.AddTriangle(n,n+1,n+2);v.AddTriangle(n,n+2,n+3);}
  public static void Line(VertexHelper v,Vector2 a,Vector2 b,float width,Color start,Color end){var d=(b-a).normalized;var p=new Vector2(-d.y,d.x)*width*.5f;Quad(v,a-p,a+p,b+p,b-p,start,end);}
  public static void Ring(VertexHelper v,Vector2 center,float radius,float width,Color color,float rotation=0,float fraction=1){const int count=64;for(var i=0;i<count*fraction;i++){var a=rotation+i*Mathf.PI*2/count;var b=rotation+(i+1)*Mathf.PI*2/count;var p=new Vector2(Mathf.Cos(a),Mathf.Sin(a));var q=new Vector2(Mathf.Cos(b),Mathf.Sin(b));Quad(v,center+p*(radius-width),center+p*radius,center+q*radius,center+q*(radius-width),color,color);}}
 }
 public sealed class NativeTideMotion:MaskableGraphic {
  float time;int severity;
  public void Present(float elapsed,int danger){time=elapsed;severity=danger;SetVerticesDirty();}
  protected override void OnPopulateMesh(VertexHelper v){
   v.Clear();var r=rectTransform.rect;var w=r.width;var h=r.height;var enter=Mathf.Clamp01(time/.24f);var fade=Mathf.Clamp01((4-time)/.65f);var strength=enter*fade;var gold=new Color(1,.66f,.25f,strength);var red=new Color(.8f,.12f,.035f,strength);var center=new Vector2(0,62);
   // An ink ribbon sweeps into the scene, then breathes behind the headline.
   var band=w*Mathf.SmoothStep(0,1,Mathf.Clamp01(time/.4f));NativeFxGeometry.Quad(v,new Vector2(-band,-62-band*.035f),new Vector2(-band,185-band*.035f),new Vector2(band,185+band*.035f),new Vector2(band,-62+band*.035f),new Color(.055f,.026f,.019f,.87f*strength),new Color(.15f,.035f,.014f,.72f*strength));
   for(var j=0;j<3;j++){var wave=Mathf.Repeat(time*.6f+j/3f,1);var tint=severity>0?red:gold;tint.a=(1-wave)*.22f*strength;NativeFxGeometry.Ring(v,center,150+wave*360,2+3*(1-wave),tint,time*.2f);}
   // Traveling speed lines draw attention from the forest edges toward the warning.
   for(var i=0;i<18;i++){var angle=i*Mathf.PI*2/18+.11f;var d=new Vector2(Mathf.Cos(angle),Mathf.Sin(angle));var p=Mathf.Repeat(time*1.3f+i*.173f,1);var radius=190+(1-p)*Mathf.Max(w,h)*.7f;var a=center+d*radius;var b=center+d*(radius+65+140*p);var tint=i%3==0?gold:red;tint.a=.5f*strength*p;var clear=tint;clear.a=0;NativeFxGeometry.Line(v,a,b,i%3==0?3:1,tint,clear);}
   // Three sharp claw strokes arrive in staggered beats alongside the title.
   for(var side=-1;side<=1;side+=2)for(var i=0;i<3;i++){var t=Mathf.Clamp01((time-.09f*i)/.18f);var a=new Vector2(side*(410+i*23),144-i*9);var b=a+new Vector2(side*55,-122);var tint=gold;tint.a=.78f*strength;NativeFxGeometry.Line(v,a,Vector2.Lerp(a,b,t),7-i,tint,new Color(.9f,.15f,.04f,.12f*strength));}
   for(var side=-1;side<=1;side+=2){var a=new Vector2(side*80,-20);var b=new Vector2(side*330,-20);var tint=gold;tint.a=.8f*strength;NativeFxGeometry.Line(v,a,b,2,tint,new Color(1,.6f,.2f,0));}
   // A broad slanted highlight crosses once, independently of the persistent border.
   var sweep=Mathf.Lerp(-w*.8f,w*.8f,Mathf.Clamp01(time/.7f));if(time<.7f)NativeFxGeometry.Quad(v,new Vector2(sweep-90,-h/2),new Vector2(sweep+100,h/2),new Vector2(sweep+145,h/2),new Vector2(sweep-45,-h/2),new Color(1,.65f,.25f,0),new Color(1,.72f,.3f,.18f*strength));
  }
 }
}
