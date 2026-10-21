using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed class NativeCrewPortrait:MonoBehaviour
    {
        static Sprite circle;NativeUiSurface ring;RawImage portrait;Image energy,hunger,badge;Text caption;Color identity;RawImage healthIcon;
        public void Build(string id,int index,Font font,Text name)
        {
            caption=name;var nameRect=(RectTransform)name.transform;Place(nameRect,0,51,56,22);name.alignment=TextAnchor.MiddleCenter;name.fontSize=16;
            var outer=Rect("头像色环",transform,4,0,48,48);var image=outer.gameObject.AddComponent<Image>();ring=NativeUiSurface.Apply(image,24);ring.BorderWidth=1.5f;ring.Shadow=true;
            var mask=Rect("圆形头像裁切",outer,2.5f,2.5f,43,43);var maskImage=mask.gameObject.AddComponent<Image>();maskImage.sprite=Circle();mask.gameObject.AddComponent<Mask>().showMaskGraphic=false;
            var face=Rect("原版头像",mask,0,0,43,43);portrait=face.gameObject.AddComponent<RawImage>();portrait.texture=Resources.Load<Texture2D>("Hud/"+id);portrait.raycastTarget=false;
            var shortcut=Rect("数字快捷键",transform,1,-2,13,13);var back=shortcut.gameObject.AddComponent<Image>();var surface=NativeUiSurface.Apply(back,6.5f);surface.Set(new Color32(31,53,38,255),new Color32(31,53,38,255),new Color32(114,142,91,255));surface.Shadow=false;
            var number=Text(shortcut,(index+1).ToString(),font,8);number.color=new Color32(199,218,164,255);
            energy=Meter("精力",10,73,new Color32(164,190,104,255));hunger=Meter("饥饿",27.5f,73,new Color32(218,143,117,255));
            var badgeRect=Rect("健康提醒",transform,34,29,17,17);badge=badgeRect.gameObject.AddComponent<Image>();badge.sprite=Circle();badge.color=new Color32(48,52,38,255);badge.gameObject.SetActive(false);
            var symbol=healthIcon=Rect("健康图标",badgeRect,3,3,11,11).gameObject.AddComponent<RawImage>();symbol.texture=Resources.Load<Texture2D>("Hud/HeartPulse");symbol.color=new Color32(246,182,125,255);symbol.raycastTarget=false;
        }
        public void Present(JToken npc,bool selected)
        {
            if(npc==null){caption.text="";return;}
            ColorUtility.TryParseHtmlString((string)npc["color"]??"#8bbcAF",out identity);var alive=(bool?)npc["alive"]!=false;
            caption.text=(string)npc["name"];caption.color=selected?new Color32(255,222,146,255):new Color32(244,240,223,255);
            ring.Set(selected?new Color32(85,67,38,255):new Color32(23,42,34,237),selected?new Color32(85,67,38,255):new Color32(23,42,34,237),selected?new Color32(243,199,106,255):identity);
            portrait.color=alive?Color.white:new Color(.5f,.5f,.5f,.6f);
            energy.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal,14.5f*Mathf.Clamp01(((float?)npc["energy"]??0)/100));hunger.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal,14.5f*Mathf.Clamp01(((float?)npc["hunger"]??0)/100));
            healthIcon.texture=Resources.Load<Texture2D>(alive?"Hud/HeartPulse":"Hud/HeartCrack");
            badge.gameObject.SetActive(!alive||(bool?)npc["injured"]==true||(double?)npc["health"]<=25);
        }
        Image Meter(string title,float x,float y,Color tint){var track=Rect(title+"轨道",transform,x,y,14.5f,2).gameObject.AddComponent<Image>();track.color=new Color(1,1,1,.12f);track.raycastTarget=false;var fill=Rect(title,track.transform,0,0,14.5f,2).gameObject.AddComponent<Image>();fill.color=tint;fill.raycastTarget=false;return fill;}
        static Text Text(Transform parent,string value,Font font,int size){var rect=Rect(value,parent,0,0,13,13);var text=rect.gameObject.AddComponent<Text>();text.text=value;text.font=font;text.fontSize=Mathf.Max(14,size);text.alignment=TextAnchor.MiddleCenter;text.verticalOverflow=VerticalWrapMode.Overflow;text.raycastTarget=false;return text;}
        static RectTransform Rect(string name,Transform parent,float x,float y,float width,float height){var rect=(RectTransform)new GameObject(name,typeof(RectTransform)).transform;rect.SetParent(parent,false);Place(rect,x,y,width,height);return rect;}
        static void Place(RectTransform rect,float x,float y,float width,float height){rect.anchorMin=rect.anchorMax=new Vector2(0,1);rect.offsetMin=new Vector2(x,-y-height);rect.offsetMax=new Vector2(x+width,-y);}
        static Sprite Circle(){if(circle!=null)return circle;var texture=new Texture2D(64,64,TextureFormat.RGBA32,false);for(var y=0;y<64;y++)for(var x=0;x<64;x++){var a=Mathf.Clamp01(32-Vector2.Distance(new Vector2(x+.5f,y+.5f),new Vector2(32,32)));texture.SetPixel(x,y,new Color(1,1,1,a));}texture.Apply();circle=Sprite.Create(texture,new UnityEngine.Rect(0,0,64,64),new Vector2(.5f,.5f));return circle;}
    }
}
