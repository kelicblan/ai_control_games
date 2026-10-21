using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        readonly Dictionary<string,GameObject> animalModels=new Dictionary<string,GameObject>();
        readonly Dictionary<string,string> animalAnimation=new Dictionary<string,string>();
        readonly Dictionary<string,Text> animalMarkers=new Dictionary<string,Text>();
        public int AnimalVisualCount=>animalModels.Values.Count(g=>g!=null&&g.activeInHierarchy);
        public static string AnimalName(string species){switch(species){case"rabbit":return"兔子";case"pheasant":return"野鸡";case"deer":return"鹿";case"boar":return"野猪";case"bear":return"熊";case"tiger":return"老虎";default:return species;}}
        void PresentAnimals()
        {
            var live=new HashSet<string>();var focus=view.lordView?view.lord.position:view.focus;
            foreach(var label in animalMarkers.Values)label.gameObject.SetActive(false);
            var markerCount=0;
            foreach(var a in Snapshot?["ecology"]?["animals"] as JArray??new JArray()){
                var id=(string)a["id"];live.Add(id);var species=(string)a["species"];var pos=a["position"];var target=view.Space.ToUnity(new Vector2((float)pos["x"],(float)pos["y"]),0);
                var visible=(target-focus).sqrMagnitude<(view.lordView?32*32:450*450)&&((double)a["hp"]>0||(double)a["carcass"]>0);
                if(!animalModels.TryGetValue(id,out var model)){
                    if(!visible)continue;var prefab=Resources.Load<GameObject>("Animals/"+char.ToUpperInvariant(species[0])+species.Substring(1));
                    if(prefab==null){Debug.LogError("Missing animal runtime prefab: "+species);continue;}
                    model=Instantiate(prefab);model.name=id;animalModels[id]=model;model.transform.position=target;
                    foreach(var animator in model.GetComponentsInChildren<Animator>()){animator.applyRootMotion=false;animator.cullingMode=AnimatorCullingMode.CullUpdateTransforms;animator.updateMode=AnimatorUpdateMode.UnscaledTime;}
                }
                model.SetActive(visible);if(!visible)continue;
                if(Physics.Raycast(target+Vector3.up*500,Vector3.down,out var hit,1000,1<<9))target.y=hit.point.y;
                model.transform.position=Vector3.Lerp(model.transform.position,target,1-Mathf.Exp(-Time.unscaledDeltaTime*16));
                var direction=view.Space.Direction(new Vector2(Mathf.Cos((float)a["heading"]),Mathf.Sin((float)a["heading"])));if(direction.sqrMagnitude>.01f)model.transform.rotation=Quaternion.LookRotation(direction);
                var mode=(string)a["mode"];var animation=(double)a["hp"]<=0?"Death":mode=="attack"?"Attack":mode=="flee"||mode=="chase"?"Run":mode=="explore"||mode=="forage"||mode=="seekWater"||mode=="stalk"||mode=="home"?"Walk":"Idle";
                foreach(var animator in model.GetComponentsInChildren<Animator>()){
                    animator.speed=(bool?)Snapshot["paused"]==true?0:(float?)Snapshot["speed"]??1;
                    if(!animalAnimation.TryGetValue(id,out var before)||before!=animation){if(animator.HasState(0,Animator.StringToHash(animation)))animator.CrossFadeInFixedTime(animation,.15f);}
                }
                animalAnimation[id]=animation;
                // A small species marker keeps forest animals discoverable through dense canopies.
                // It never changes their perception, hit tests, visibility range or authoritative state.
                var screen=view.viewCamera.WorldToScreenPoint(model.transform.position+Vector3.up*.8f);
                if(markerCount<6&&(target-focus).sqrMagnitude<40*40&&screen.z>0&&screen.x>20&&screen.x<Screen.width-20&&screen.y>70&&screen.y<Screen.height-60){
                    if(!animalMarkers.TryGetValue(id,out var marker)){marker=Label(root,AnimalName(species),14);var rect=(RectTransform)marker.transform;rect.anchorMin=rect.anchorMax=new Vector2(.5f,.5f);rect.sizeDelta=new Vector2(100,24);marker.alignment=TextAnchor.MiddleCenter;marker.raycastTarget=false;marker.color=new Color(1,.93f,.63f);marker.gameObject.AddComponent<Outline>().effectColor=new Color(.04f,.09f,.06f,.9f);animalMarkers[id]=marker;}
                    RectTransformUtility.ScreenPointToLocalPointInRectangle(root,screen,null,out var local);((RectTransform)marker.transform).anchoredPosition=local;marker.gameObject.SetActive(true);markerCount++;
                }
            }
            foreach(var entry in animalModels)if(!live.Contains(entry.Key))entry.Value.SetActive(false);
        }
        void ShowHunting()
        {
            if(Snapshot?["ecology"]?["hunt"] is JObject){Mutate("animal-hunt-cancel");return;}
            ShowManagement("狩猎");
        }
        void Hunting()
        {
            Bind(()=>"森林种群 "+(Snapshot?["ecology"]?["animals"] as JArray??new JArray()).Count(a=>(double)a["hp"]>0)+" · 新出生 "+((int?)Snapshot?["ecology"]?["population"]?["births"]??0)+" · 生态压力 "+Mathf.RoundToInt((float?)Snapshot?["ecology"]?["tide"]?["pressure"]*100??0)+"%");
            Bind(()=>Snapshot?["ecology"]?["tide"]?["alert"] is JObject warning?(string)warning["title"]+" · "+(string)warning["direction"]:"尚未发现兽潮警报");
            Text("寨外动物会自行觅食、饮水、休息和避险。靠近发现后可追猎；肉类先随身携带，再搬运入库。");
            Bind(()=>"随身肉类 "+((int?)Actor("player")?["carried"]?["meat"]??0)+" · 公共库存 "+((int?)Snapshot?["inventory"]?["meat"]??0));
            if(Snapshot?["ecology"]?["hunt"] is JObject job){Bind(()=>"领主正在追猎 · "+Snapshot?["ecology"]?["hunt"]?["phase"]);Button(content,"停止追猎",()=>Mutate("animal-hunt-cancel"));return;}
            var p=Actor("player")["position"];var px=(double)p["x"];var py=(double)p["y"];
            var nearby=(Snapshot?["ecology"]?["animals"] as JArray??new JArray()).Where(a=>((double)a["hp"]>0||(double)a["carcass"]>0)&&Math.Pow((double)a["position"]["x"]-px,2)+Math.Pow((double)a["position"]["y"]-py,2)<=28*28).ToArray();
            if(nearby.Length==0)Text("附近尚未发现动物。出寨进入森林后再查看；可在鹰眼中确认领主位置。");
            foreach(var a in nearby){var id=(string)a["id"];Button(content,AnimalName((string)a["species"])+((double)a["hp"]>0?" · 追猎":" · 搬运猎物"),()=>Mutate("animal-hunt",new JObject{["targetId"]=id,["operationId"]=Guid.NewGuid().ToString("N")}));}
            Button(content,"存入携带物资",()=>Command("DEPOSIT"));
        }
        string HuntingSignature()
        {
            if(Actor("player")?["position"] is not JObject p)return "";
            var px=(double)p["x"];var py=(double)p["y"];
            return (Snapshot?["ecology"]?["hunt"] as JObject)?["operationId"]+"|"+String.Join(",",(Snapshot?["ecology"]?["animals"] as JArray??new JArray()).Where(a=>Math.Pow((double)a["position"]["x"]-px,2)+Math.Pow((double)a["position"]["y"]-py,2)<=28*28).Select(a=>a["id"]+":"+((double)a["hp"]>0)+":"+((double)a["carcass"]>0)));
        }
    }
}
