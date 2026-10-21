using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    // Source CSS surfaces have independent gradients, rounded borders and shadows.
    // Keep the hit target separate from the decoration (not a solid button tile).
    [RequireComponent(typeof(CanvasRenderer))]
    public sealed class NativeUiSurface:MaskableGraphic
    {
        public Color Top=new Color32(32,55,44,242),Bottom=new Color32(16,31,25,237),Border=new Color32(214,212,166,79);
        public float Radius=11,BorderWidth=.75f;public bool Shadow=true;
        readonly List<Vector2> outline=new List<Vector2>();
        public static NativeUiSurface Apply(Image target,float radius=11)
        {
            var existing=target.transform.Find("原版表面");
            if(existing!=null)return existing.GetComponent<NativeUiSurface>();
            var go=new GameObject("原版表面",typeof(RectTransform),typeof(CanvasRenderer));go.transform.SetParent(target.transform,false);go.transform.SetAsFirstSibling();
            var rect=(RectTransform)go.transform;rect.anchorMin=Vector2.zero;rect.anchorMax=Vector2.one;rect.offsetMin=rect.offsetMax=Vector2.zero;
            var surface=go.AddComponent<NativeUiSurface>();surface.raycastTarget=false;surface.Radius=radius;target.color=Color.clear;return surface;
        }
        public static void Plain(Image image){image.color=Color.clear;var skin=image.transform.Find("原版表面");if(skin!=null)skin.gameObject.SetActive(false);}
        public void Set(Color top,Color bottom,Color border,float radius=-1){Top=top;Bottom=bottom;Border=border;if(radius>=0)Radius=radius;SetVerticesDirty();}
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();var rect=rectTransform.rect;if(rect.width<=0||rect.height<=0)return;
            if(Shadow)for(var i=4;i>=1;i--){var expanded=new Rect(rect.x-i,rect.y-i-3,rect.width+2*i,rect.height+2*i);Fill(vh,expanded,Radius+i,new Color(6/255f,21/255f,14/255f,.022f),false);}
            Ring(vh,rect,Radius,BorderWidth,Border);var inset=BorderWidth;
            if(Top.a>0||Bottom.a>0)Fill(vh,new Rect(rect.x+inset,rect.y+inset,rect.width-2*inset,rect.height-2*inset),Mathf.Max(0,Radius-inset),Color.white,true);
        }
        static void Ring(VertexHelper vh,Rect rect,float radius,float width,Color tint)
        {
            if(width<=0||tint.a<=0)return;radius=Mathf.Min(radius,Mathf.Min(rect.width,rect.height)/2);width=Mathf.Min(width,Mathf.Min(rect.width,rect.height)/2);
            var inner=new Rect(rect.x+width,rect.y+width,rect.width-width*2,rect.height-width*2);var innerRadius=Mathf.Max(0,radius-width);var start=vh.currentVertCount;
            Vector2 Center(Rect r,float rad,int corner)=>corner==0?new Vector2(r.xMax-rad,r.yMax-rad):corner==1?new Vector2(r.xMin+rad,r.yMax-rad):corner==2?new Vector2(r.xMin+rad,r.yMin+rad):new Vector2(r.xMax-rad,r.yMin+rad);
            for(var corner=0;corner<4;corner++)for(var i=0;i<=8;i++){var angle=(corner*90+i*90f/8)*Mathf.Deg2Rad;var direction=new Vector2(Mathf.Cos(angle),Mathf.Sin(angle));Vertex(vh,Center(rect,radius,corner)+direction*radius,tint);Vertex(vh,Center(inner,innerRadius,corner)+direction*innerRadius,tint);}
            const int count=36;for(var i=0;i<count;i++){var current=start+i*2;var next=start+(i+1)%count*2;vh.AddTriangle(current,current+1,next+1);vh.AddTriangle(current,next+1,next);}
        }
        void Fill(VertexHelper vh,Rect rect,float radius,Color flat,bool gradient)
        {
            if(rect.width<=0||rect.height<=0)return;radius=Mathf.Min(radius,Mathf.Min(rect.width,rect.height)/2);outline.Clear();
            var centers=new[]{new Vector2(rect.xMax-radius,rect.yMax-radius),new Vector2(rect.xMin+radius,rect.yMax-radius),new Vector2(rect.xMin+radius,rect.yMin+radius),new Vector2(rect.xMax-radius,rect.yMin+radius)};
            for(var corner=0;corner<4;corner++)for(var i=0;i<=8;i++){var angle=(corner*90+i*90f/8)*Mathf.Deg2Rad;outline.Add(centers[corner]+new Vector2(Mathf.Cos(angle),Mathf.Sin(angle))*radius);}
            var start=vh.currentVertCount;Vertex(vh,rect.center,gradient?Color.Lerp(Top,Bottom,.5f):flat);
            foreach(var point in outline){var t=Mathf.Clamp01(.5f+.41f*(point.x-rect.center.x)/rect.width-.59f*(point.y-rect.center.y)/rect.height);Vertex(vh,point,gradient?Color.Lerp(Top,Bottom,t):flat);}
            for(var i=0;i<outline.Count;i++)vh.AddTriangle(start,start+1+i,start+1+(i+1)%outline.Count);
        }
        static void Vertex(VertexHelper vh,Vector2 point,Color color){var v=UIVertex.simpleVert;v.position=point;v.color=color;vh.AddVert(v);}
    }
}
