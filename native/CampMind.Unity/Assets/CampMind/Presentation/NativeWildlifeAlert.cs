using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation {
 public sealed class NativeWildlifeAlert:MonoBehaviour {
  NativeVillageUi village;GameObject root,banner;Text title,detail,bar;Image wash;AudioSource audioSource;AudioClip horn;string scope="",seen="";float until;NativeTideMotion motion;CanvasGroup animationGroup;
  readonly HashSet<string> seenPhases=new HashSet<string>();readonly Queue<string> phaseHistory=new Queue<string>();
  void RememberPhase(string key){if(seenPhases.Add(key))phaseHistory.Enqueue(key);while(phaseHistory.Count>128)seenPhases.Remove(phaseHistory.Dequeue());}
  public bool BannerVisible=>banner!=null&&banner.activeSelf;
  public string AlertTitle=>title!=null?title.text:"";
  public int AnnouncementCount {get;private set;}
  void Start(){
   village=GetComponent<NativeVillageUi>();root=new GameObject("兽潮全屏预警",typeof(RectTransform),typeof(Canvas),typeof(CanvasScaler),typeof(CanvasGroup));var canvas=root.GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=75;var scale=root.GetComponent<CanvasScaler>();scale.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scale.referenceResolution=new Vector2(1920,1080);var group=root.GetComponent<CanvasGroup>();group.blocksRaycasts=false;group.interactable=false;
   var rect=(RectTransform)root.transform;rect.anchorMin=Vector2.zero;rect.anchorMax=Vector2.one;rect.offsetMin=rect.offsetMax=Vector2.zero;
   banner=new GameObject("全屏强提醒",typeof(RectTransform));banner.transform.SetParent(root.transform,false);var br=(RectTransform)banner.transform;br.anchorMin=Vector2.zero;br.anchorMax=Vector2.one;br.offsetMin=br.offsetMax=Vector2.zero;
   wash=banner.AddComponent<Image>();wash.raycastTarget=false;wash.color=new Color(.55f,.02f,.01f,.10f);
   for(var i=0;i<4;i++){var edge=new GameObject("危险边缘",typeof(RectTransform),typeof(Image));edge.transform.SetParent(banner.transform,false);var r=(RectTransform)edge.transform;r.anchorMin=i<2?new Vector2(i,0):new Vector2(0,i-2);r.anchorMax=i<2?new Vector2(i,1):new Vector2(1,i-2);r.pivot=i<2?new Vector2(i,.5f):new Vector2(.5f,i-2);r.sizeDelta=i<2?new Vector2(22,0):new Vector2(0,22);edge.GetComponent<Image>().color=new Color(.65f,.05f,.01f,.8f);edge.GetComponent<Image>().raycastTarget=false;}
   animationGroup=banner.AddComponent<CanvasGroup>();animationGroup.blocksRaycasts=false;animationGroup.interactable=false;var motionGo=new GameObject("兽潮动态演出",typeof(RectTransform),typeof(NativeTideMotion));motionGo.transform.SetParent(banner.transform,false);var mr=(RectTransform)motionGo.transform;mr.anchorMin=Vector2.zero;mr.anchorMax=Vector2.one;mr.offsetMin=mr.offsetMax=Vector2.zero;motion=motionGo.GetComponent<NativeTideMotion>();motion.raycastTarget=false;
   title=Label(banner.transform,54,new Vector2(0,95),new Vector2(1500,100));detail=Label(banner.transform,24,new Vector2(0,20),new Vector2(1500,55));bar=Label(root.transform,20,new Vector2(0,-130),new Vector2(1100,38));var rt=(RectTransform)bar.transform;rt.anchorMin=rt.anchorMax=new Vector2(.5f,1);bar.color=new Color(1,.78f,.45f);banner.SetActive(false);bar.gameObject.SetActive(false);
   audioSource=gameObject.AddComponent<AudioSource>();audioSource.playOnAwake=false;audioSource.spatialBlend=0;var data=new float[44100*2];for(var i=0;i<data.Length;i++){var t=i/44100f;var envelope=Mathf.Min(1,t*5)*Mathf.Min(1,(2-t)*3);data[i]=envelope*(Mathf.Sin(2*Mathf.PI*180*t)+.35f*Mathf.Sin(2*Mathf.PI*360*t))*.16f;}horn=AudioClip.Create("兽潮号角",data.Length,1,44100,false);horn.SetData(data,0);
  }
  Text Label(Transform parent,int size,Vector2 offset,Vector2 dimensions){var go=new GameObject("预警文字",typeof(RectTransform),typeof(Text),typeof(Outline));go.transform.SetParent(parent,false);var r=(RectTransform)go.transform;r.anchorMin=r.anchorMax=new Vector2(.5f,.5f);r.anchoredPosition=offset;r.sizeDelta=dimensions;var t=go.GetComponent<Text>();t.font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular")??Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");t.fontSize=size;t.color=new Color(1,.85f,.6f);t.alignment=TextAnchor.MiddleCenter;t.raycastTarget=false;go.GetComponent<Outline>().effectColor=new Color(.12f,.02f,0,.95f);return t;}
  void Update(){
   if(root==null)return;var s=village?.Snapshot;var active=village!=null&&village.VillageActive&&s!=null&&!NativeStartup.Active;root.SetActive(active);if(!active)return;
   if(PlayerPrefs.GetInt("camp.native.sound",1)==0&&audioSource.isPlaying)audioSource.Stop();
   var world=(string)s["worldId"]??"";if(world!=scope){scope=world;seen=PlayerPrefs.GetString("camp.wildlife.last-alert."+world,"");seenPhases.Clear();phaseHistory.Clear();foreach(var old in PlayerPrefs.GetString("camp.wildlife.alert-history."+world,"").Split('\n'))if(!string.IsNullOrEmpty(old))RememberPhase(old);if(!string.IsNullOrEmpty(seen)){RememberPhase(seen);var cut=seen.LastIndexOf(':');var stages=new[]{"gathering","approaching","attacking","breached","retreating","cooldown"};var last=cut>=0?Array.IndexOf(stages,seen.Substring(cut+1)):-1;for(var i=0;i<=last;i++)RememberPhase(seen.Substring(0,cut+1)+stages[i]);}until=0;banner.SetActive(false);}
   var alert=s["ecology"]?["tide"]?["alert"] as JObject;if(alert==null){bar.gameObject.SetActive(false);banner.SetActive(false);return;}
   var severity=(int?)alert["severity"]??0;bar.gameObject.SetActive(severity>0);bar.text=(string)alert["title"]+" · "+(string)alert["direction"];
   var key=world+":"+(string)alert["id"];if(!seenPhases.Contains(key)){seen=key;RememberPhase(key);PlayerPrefs.SetString("camp.wildlife.alert-history."+world,String.Join("\n",phaseHistory));PlayerPrefs.SetString("camp.wildlife.last-alert."+world,key);PlayerPrefs.Save();title.text=(string)alert["title"];detail.text=(string)alert["direction"]+" · "+(severity>0?"召回伙伴、关紧寨门，准备防御":"检查伤员、修复围栏，恢复生产");until=Time.unscaledTime+4;AnnouncementCount++;if(severity>0&&Application.isFocused&&(bool?)s["paused"]!=true&&PlayerPrefs.GetInt("camp.native.sound",1)==1)audioSource.PlayOneShot(horn);}
   var elapsed=4-(until-Time.unscaledTime);var showing=Time.unscaledTime<until;banner.SetActive(showing);bar.color=new Color(1,.7f+.1f*Mathf.Sin(Time.unscaledTime*2.5f),.36f);if(showing){motion.Present(elapsed,severity);animationGroup.alpha=Mathf.Clamp01(elapsed/.12f)*Mathf.Clamp01((4-elapsed)/.6f);var settle=Mathf.Exp(-elapsed*9);title.rectTransform.localScale=Vector3.one*(1+.28f*settle*Mathf.Cos(elapsed*17));title.rectTransform.anchoredPosition=new Vector2(severity>1?Mathf.Sin(elapsed*50)*5*settle:0,95+40*settle);wash.color=new Color(.5f,.025f,.008f,.045f+.055f*(.5f+.5f*Mathf.Sin(elapsed*8)));}
  }
  void OnDestroy(){if(root!=null)Destroy(root);if(horn!=null)Destroy(horn);if(audioSource!=null)Destroy(audioSource);}
 }
}
