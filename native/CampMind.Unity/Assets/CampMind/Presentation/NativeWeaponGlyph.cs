using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    // Small resolution-independent inventory silhouettes; no runtime texture allocation.
    public sealed class NativeWeaponGlyph:MaskableGraphic
    {
        public string Recipe="WPN002";
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            raycastTarget=false;vh.Clear();var r=rectTransform.rect;
            Vector2 P(float x,float y)=>new Vector2(r.xMin+x*r.width,r.yMin+y*r.height);
            var wood=new Color32(173,126,73,255);var edge=new Color32(218,184,121,255);var stone=new Color32(172,186,173,255);
            void Line(Vector2 a,Vector2 b,float width,Color tint){var d=(b-a).normalized;var n=new Vector2(-d.y,d.x)*width/2;var i=vh.currentVertCount;foreach(var p in new[]{a-n,a+n,b+n,b-n}){var v=UIVertex.simpleVert;v.position=p;v.color=tint;vh.AddVert(v);}vh.AddTriangle(i,i+1,i+2);vh.AddTriangle(i,i+2,i+3);}
            if(Recipe=="WPN003"||Recipe=="WPN005"){
                var previous=P(.22f,.12f);for(var i=1;i<=16;i++){var t=i/16f;var next=P(.22f+Mathf.Sin(t*Mathf.PI)*.46f,.12f+t*.76f);Line(previous,next,Recipe=="WPN005"?4:3,wood);previous=next;}Line(P(.22f,.12f),P(.22f,.88f),1,edge);Line(P(.19f,.5f),P(.8f,.5f),1,edge);
            }else{
                Line(P(.14f,.17f),P(.83f,.85f),Recipe=="WPN001"?5:7,Recipe=="WPN004"||Recipe=="WPN006"?stone:wood);
                Line(P(.14f,.17f),P(.32f,.35f),6,wood);
                if(Recipe!="WPN001"){Line(P(.24f,.44f),P(.44f,.24f),3,edge);Line(P(.38f,.4f),P(.82f,.84f),1,edge);}
                if(Recipe=="WPN006"){Line(P(.55f,.91f),P(.89f,.57f),12,stone);}
            }
        }
    }
}
