using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.InputSystem;
namespace CampMind.Presentation
{
    [DefaultExecutionOrder(200)]
    public sealed class NativeActorOverlay:MonoBehaviour
    {
        sealed class Slot {public Transform Actor;public RectTransform Root,Bubble;public Text Name,Speech,Damage;public Image Progress;public JObject State;}
        NativeCampView view;Font font;Func<string,NativeWorldChannel.Message> bubble;
        readonly Dictionary<string,Slot> slots=new Dictionary<string,Slot>();
        JObject state;string hovered;float nextHover;
        public void Initialize(NativeCampView target,Font face,Func<string,NativeWorldChannel.Message> publishedBubble){view=target;font=face;bubble=publishedBubble;}
        public bool ActorVisible(string id)=>slots.TryGetValue(id,out var slot)&&slot.Root.gameObject.activeInHierarchy;
        public void Present(JObject snapshot)
        {
            state=snapshot;if(state==null){foreach(var value in slots.Values)value.Root.gameObject.SetActive(false);return;}
            foreach(var npc in state["npcs"] as JArray??new JArray())
            {
                var id=(string)npc["id"];if(!slots.TryGetValue(id,out var slot))
                {
                    var actor=(view.characters??Array.Empty<Transform>()).FirstOrDefault(t=>t.name==id);if(actor==null)continue;
                    var root=Rect(id,transform,new Vector2(60,22));root.pivot=new Vector2(.5f,0);
                    var background=root.gameObject.AddComponent<Image>();background.color=new Color(.07f,.14f,.1f,.9f);background.raycastTarget=false;
                    var name=Label(root,new Vector2(54,18),new Vector2(0,12));name.fontSize=14;
                    var bar=Rect("真实任务进度",root,new Vector2(50,2));bar.anchorMin=bar.anchorMax=Vector2.zero;bar.pivot=new Vector2(0,.5f);bar.anchoredPosition=new Vector2(5,5);var progress=bar.gameObject.AddComponent<Image>();progress.color=new Color(.76f,.67f,.36f);progress.raycastTarget=false;
                    var box=Rect("已确认对白",root,new Vector2(240,80));box.anchorMin=box.anchorMax=new Vector2(.5f,0);box.anchoredPosition=new Vector2(0,74);var backdrop=box.gameObject.AddComponent<Image>();backdrop.color=new Color(.04f,.11f,.08f,.94f);backdrop.raycastTarget=false;
                    var speech=Label(box,new Vector2(224,68),new Vector2(0,40));speech.fontSize=14;
                    var damage=Label(root,new Vector2(150,34),new Vector2(0,198));damage.color=new Color(1,.48f,.32f);
                    slot=new Slot{Actor=actor,Root=root,Bubble=box,Name=name,Speech=speech,Damage=damage,Progress=progress};slots[id]=slot;
                }
                slot.State=(JObject)npc;slot.Name.text=(string)npc["name"]+((bool?)npc["alive"]==false?" · 已离世":"");
                slot.Progress.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal,50*Mathf.Clamp01((float?)npc["progress"]??0));
            }
        }
        void LateUpdate()
        {
            if(view==null)return;
            if(Time.unscaledTime>=nextHover){nextHover=Time.unscaledTime+.15f;hovered=Mouse.current!=null&&!view.InputBlocked&&!view.PointerBlocked?view.PickNpc(view.viewCamera.ScreenPointToRay(Mouse.current.position.ReadValue())):null;}
            Render(hovered);
        }
        public void Render(string hover)
        {
            foreach(var pair in slots)
            {
                var slot=pair.Value;var selected=pair.Key==view.SelectedNpc;var hit=slot.State?["collision"]?["lastHit"];
                var age=(double?)state?["elapsed"]-(double?)hit?["time"];var reacting=hit!=null&&age>=0&&age<1.65;
                var point=view.viewCamera.WorldToViewportPoint(view.ActorHead(slot.Actor));
                var visible=!view.lordView&&(selected||hover==pair.Key||reacting)&&point.z>0&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1;
                slot.Root.gameObject.SetActive(visible);if(!visible)continue;
                var canvas=((RectTransform)transform).rect;slot.Root.anchoredPosition=new Vector2((point.x-.5f)*canvas.width,(point.y-.5f)*canvas.height+5);
                slot.Name.color=selected?new Color(1,.88f,.6f):Color.white;
                var line=selected?bubble?.Invoke(pair.Key):null;slot.Speech.text=line!=null&&(double?)state?["elapsed"]-line.Time<8?line.Text:"";
                slot.Bubble.gameObject.SetActive(!string.IsNullOrEmpty(slot.Speech.text));
                slot.Damage.text=reacting?$"碰撞反应{((double?)hit["damage"]>0?" −"+Math.Round((double)hit["damage"]):"")}":"";
            }
        }
        RectTransform Rect(string name,Transform parent,Vector2 size){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var rect=(RectTransform)go.transform;rect.anchorMin=rect.anchorMax=new Vector2(.5f,.5f);rect.sizeDelta=size;return rect;}
        Text Label(Transform parent,Vector2 size,Vector2 position){var rect=Rect("角色反馈",parent,size);rect.anchorMin=rect.anchorMax=new Vector2(.5f,0);rect.anchoredPosition=position;var text=rect.gameObject.AddComponent<Text>();text.font=font;text.fontSize=17;text.color=new Color(.95f,.95f,.84f);text.alignment=TextAnchor.MiddleCenter;text.supportRichText=false;text.raycastTarget=false;return text;}
    }
}
