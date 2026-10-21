using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    // Shared measured palette and authored atlas assets from the approved reference.
    public static class ReferenceUiArt
    {
        public static readonly Color Gold=new Color32(232,199,126,255),Ivory=new Color32(235,234,211,255),Muted=new Color32(170,184,159,255),Border=new Color32(170,148,88,175),Ink=new Color32(11,30,24,255);
        public static NativeUiSurface Surface(Image image,bool selected=false,float radius=7)
        {
            var s=NativeUiSurface.Apply(image,radius);s.BorderWidth=1;s.Shadow=true;s.Set(selected?new Color32(79,76,37,255):new Color32(18,43,34,255),selected?new Color32(54,57,29,255):new Color32(8,26,20,255),selected?Gold:Border,radius);return s;
        }
        public static RawImage Atlas(RectTransform rect,string atlas,int index)
        {
            var image=rect.gameObject.AddComponent<RawImage>();image.texture=Resources.Load<Texture2D>("Hud/"+atlas);image.uvRect=new Rect(index%3/3f,1-(index/3+1)/2f,1/3f,1/2f);image.color=Color.white;image.raycastTarget=false;return image;
        }
        public static int WeaponIndex(string id){int.TryParse(id?.Replace("WPN",""),out var value);return Mathf.Clamp(value-1,0,5);}
    }
}
