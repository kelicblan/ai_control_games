using System;
using System.Globalization;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
namespace CampMind.Presentation
{
    // A read-only terrain raster and camera controls. No simulation or reveal command.
    public sealed class NativeWorldAtlas:MonoBehaviour,IPointerDownHandler,IPointerClickHandler,IBeginDragHandler,IDragHandler,IEndDragHandler,IScrollHandler
    {
        NativeCampView view;RawImage image;Texture2D texture;Vector2 center=new Vector2(50,55),dragStart,dragCenter;
        float span=800,nextRequest,nextMarkers;bool busy,dragged,dragging,expanded;int generation;string scope;
        readonly List<Text> markers=new List<Text>();
        readonly List<Text> labels=new List<Text>();readonly List<Rect> labelBoxes=new List<Rect>();
        public void Initialize(NativeCampView target,bool large=false){view=target;expanded=large;span=large?2400:800;image=GetComponent<RawImage>();image.uvRect=new Rect(0,1,1,-1);texture=new Texture2D(130,130,TextureFormat.RGBA32,false,true);texture.filterMode=FilterMode.Point;image.texture=texture;
            for(var i=0;i<12;i++){var go=new GameObject("地图标记",typeof(RectTransform),typeof(Text));go.transform.SetParent(transform,false);var rect=(RectTransform)go.transform;rect.anchorMin=rect.anchorMax=new Vector2(.5f,.5f);rect.sizeDelta=new Vector2(16,20);var text=go.GetComponent<Text>();text.font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular");text.fontSize=14;text.alignment=TextAnchor.MiddleCenter;text.raycastTarget=false;markers.Add(text);
                var title=new GameObject("地图名称",typeof(RectTransform),typeof(Text));title.transform.SetParent(transform,false);var titleRect=(RectTransform)title.transform;titleRect.anchorMin=titleRect.anchorMax=new Vector2(.5f,.5f);titleRect.pivot=new Vector2(0,.5f);var label=title.GetComponent<Text>();label.font=text.font;label.fontSize=14;label.alignment=TextAnchor.MiddleLeft;label.raycastTarget=false;labels.Add(label);
            }
        }
        public void Zoom(float factor){span=Mathf.Clamp(span*factor,128,16384);Invalidate();}
        public void Home(){center=new Vector2(50,55);Locate(center);Invalidate();}
        public void Follow(){center=view.Space.ToLogical(view.Selection.position);Locate(center);Invalidate();}
        void Invalidate(){generation++;nextRequest=0;}
        void Locate(Vector2 point){if(view.lordView){view.lordView=false;view.Authority?.ReleaseMotion();}view.focus=view.Space.ToUnity(point,1.5f);}
        void Update()
        {
            if(view?.Authority?.gate.Scope!=scope){scope=view?.Authority?.gate.Scope;Invalidate();var black=new Color32[130*130];for(var i=0;i<black.Length;i++)black[i]=new Color32(4,7,9,255);texture.SetPixels32(black);texture.Apply(false);}
            if(view!=null&&Time.unscaledTime>=nextMarkers){nextMarkers=Time.unscaledTime+.18f;var index=0;var rect=((RectTransform)transform).rect;labelBoxes.Clear();
                if(!expanded&&!dragging){var follow=view.Space.ToLogical(view.lordView?view.lord.position:view.focus);if(Vector2.Distance(follow,center)>span/128){center=follow;Invalidate();}}
                if(expanded&&Keyboard.current!=null){var keys=Keyboard.current;var delta=new Vector2((keys.rightArrowKey.isPressed?1:0)-(keys.leftArrowKey.isPressed?1:0),(keys.downArrowKey.isPressed?1:0)-(keys.upArrowKey.isPressed?1:0));if(delta!=Vector2.zero){center+=delta*span*.15f;Locate(center);Invalidate();}}
                void Marker(string name,Vector2 point,Color color){if(index>=markers.Count)return;var text=markers[index];var label=labels[index++];var relative=(point-center)/span;var visible=Mathf.Abs(relative.x)<.5f&&Mathf.Abs(relative.y)<.5f;text.gameObject.SetActive(visible);label.gameObject.SetActive(false);if(!visible)return;text.text=name.StartsWith("◆")?"◆":"•";text.color=color;var position=new Vector2(relative.x*rect.width,-relative.y*rect.height);((RectTransform)text.transform).anchoredPosition=position;
                    if(!expanded)return;label.text=name.TrimStart('◆','•',' ');label.color=new Color(1,.97f,.87f);var width=label.preferredWidth;var box=new Rect(position.x+8,position.y-2,width,20);
                    if(box.xMax>rect.xMax-2||box.yMax>rect.yMax-2||box.xMin<rect.xMin+2||box.yMin<rect.yMin+2||labelBoxes.Exists(other=>new Rect(other.x-4,other.y-4,other.width+8,other.height+8).Overlaps(box)))return;
                    labelBoxes.Add(box);label.gameObject.SetActive(true);var title=(RectTransform)label.transform;title.anchoredPosition=position+new Vector2(8,8);title.sizeDelta=new Vector2(width,20);
                }
                Marker("◆ 营地",new Vector2(50,55),new Color(1,.85f,.4f));
                foreach(var npc in view.World?["npcs"] as JArray??new JArray())if((bool?)npc["alive"]!=false){var p=npc["position"];Marker("• "+npc["name"],new Vector2((float)p["x"],(float)p["y"]),(string)npc["id"]==view.SelectedNpc?Color.yellow:Color.white);}
                if(view.World?["lord"]?["position"] is JObject lord)Marker("◆ 领主",new Vector2((float)lord["x"],(float)lord["y"]),Color.cyan);
                while(index<markers.Count){markers[index].gameObject.SetActive(false);labels[index++].gameObject.SetActive(false);}
            }
            if(view?.Authority?.Connected!=true||view.World==null||busy||Time.unscaledTime<nextRequest)return;
            busy=true;nextRequest=Time.unscaledTime+.5f;var version=generation;
            var query="/game-api/native-map?x="+center.x.ToString(CultureInfo.InvariantCulture)+"&y="+center.y.ToString(CultureInfo.InvariantCulture)+"&span="+span.ToString(CultureInfo.InvariantCulture);
            view.Authority.Api(query,null,(data,error)=>{busy=false;if(this==null||version!=generation||error!=null)return;
                var bytes=Convert.FromBase64String((string)data["rgba"]);if(bytes.Length!=130*130*4)return;texture.LoadRawTextureData(bytes);texture.Apply(false);
                var step=(float)data["step"];var size=step*130;var uvSpan=span/size;
                image.uvRect=new Rect((center.x-span/2-(float)data["x"])/size,(center.y+span/2-(float)data["y"])/size,uvSpan,-uvSpan);
            });
        }
        Vector2 Local(PointerEventData data){RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)transform,data.position,data.pressEventCamera,out var point);return point;}
        public void OnPointerDown(PointerEventData data){dragged=false;}
        public void OnPointerClick(PointerEventData data){if(dragged)return;var point=Local(data);var rect=((RectTransform)transform).rect;Locate(center+new Vector2(point.x/rect.width,-point.y/rect.height)*span);}
        public void OnBeginDrag(PointerEventData data){dragStart=Local(data);dragCenter=center;dragged=false;dragging=true;}
        public void OnDrag(PointerEventData data){var delta=Local(data)-dragStart;if(delta.sqrMagnitude<16)return;dragged=true;var rect=((RectTransform)transform).rect;center=dragCenter-new Vector2(delta.x/rect.width,-delta.y/rect.height)*span;Locate(center);Invalidate();}
        public void OnEndDrag(PointerEventData data){dragging=false;}
        public void OnScroll(PointerEventData data){Zoom(Mathf.Exp(-data.scrollDelta.y*.1f));}
        void OnDestroy(){if(texture!=null)Destroy(texture);}
    }
}
