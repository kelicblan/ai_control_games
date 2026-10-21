using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        readonly List<(Image image,Func<float> value)> progressFills=new List<(Image,Func<float>)>();
        Text goalHud;
        public static string GrowthProgress(JToken g)
        {
            if(g==null)return "成长记录正在加载";
            return (bool?)g["maxLevel"]==true?"已达满级 · 累计 "+g["experience"]+" 经验":"经验 "+g["currentLevelXp"]+" / "+g["requiredXp"]+" · 还差 "+g["remainingXp"]+" · 累计 "+g["experience"];
        }
        public static string GrowthGains(JToken g)=>g==null?"已达满级": "生命 +"+((double?)g["hp"]??0).ToString("0.#")+" / 攻击 +"+((double?)g["attack"]??0).ToString("0.#")+" / 防御 +"+((double?)g["defense"]??0).ToString("0.#");
        void BuildGrowth()
        {
            DetailBind(()=>GrowthProgress(Actor(selected)?["growth"]));
            var bar=Box("经验进度",details,new Vector2(0,1),Vector2.one,Vector2.zero,Vector2.zero);Height(bar.gameObject,8);bar.gameObject.AddComponent<Image>().color=Line;
            var fill=Box("当前经验",bar,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero).gameObject.AddComponent<Image>();fill.color=Gold;fill.type=Image.Type.Filled;fill.fillMethod=Image.FillMethod.Horizontal;
            progressFills.Add((fill,()=>{var g=Actor(selected)?["growth"];return (bool?)g?["maxLevel"]==true?1:(float?)g?["requiredXp"]>0?Mathf.Clamp01((float)g["currentLevelXp"]/(float)g["requiredXp"]):0;}));
            DetailBind(()=>"下一级："+GrowthGains(Actor(selected)?["growth"]?["nextGains"]));
            DetailBind(()=>{var s=Actor(selected)?["growth"]?["stats"];return "当前攻击 "+s?["attack"]+" / 防御 "+s?["defense"]+" / 射程 "+s?["range"];});
            DetailBind(()=>{var s=Actor(selected)?["growth"]?["stats"];return "采集能力 "+((double?)s?["gather"]??0).ToString("0.##")+" / 探索能力 "+((double?)s?["explore"]??0).ToString("0.##");});
            DetailText("每级采集增加基础值的3%、探索增加4%；武器改变攻击与射程。生命上限增加不会凭空治疗伤势。",14,Muted);
            DetailBind(()=>"最近贡献："+String.Join("；",(Actor(selected)?["growth"]?["recent"] as JArray??new JArray()).Take(3).Select(e=>(ActivityLabel((string)e["action"])??"贡献")+" +"+e["amount"]+"经验")));
            DetailBind(()=>"经验来源："+String.Join(" / ",(Actor(selected)?["growth"]?["sources"] as JObject)?.Properties().Select(p=>SourceName(p.Name)+" +"+p.Value)??Array.Empty<string>()));
        }
        static string SourceName(string s)=>s=="gather"?"采集":s=="craft"?"制作":s=="build"?"建设":s=="repair"?"修理":s=="combat"?"战斗":s=="explore"?"探索":s=="rescue"?"救援":s=="delivery"?"入库":s;
        void BuildJourney()
        {
            var j=Snapshot?["uiCatalog"]?["journey"];if(j==null)return;
            DetailText("现在做什么",20,Gold);
            DetailBind(()=>{var v=Snapshot?["uiCatalog"]?["journey"];return v?["current"] is JObject?"当前目标："+v["current"]["title"]:"首轮目标已完成 · 选择下一步发展";});
            DetailBind(()=>"已完成 "+Snapshot?["uiCatalog"]?["journey"]?["progress"]+" / "+Snapshot?["uiCatalog"]?["journey"]?["total"]);
            DetailText((string)j["current"]?["instruction"]??"扩大人口会增加消耗；加强围栏和装备能提高生存把握。");
            DetailText((string)j["current"]?["benefit"]??"你已完成从生产、装备到收获的第一轮积累。",14,Muted);
            var page=(string)j["current"]?["page"];if(page!=null){var list=content;content=details;Button(content,"前往："+j["current"]["title"],()=>ShowManagement(page));content=list;}
            DetailBind(()=>{var f=Snapshot?["uiCatalog"]?["journey"]?["food"];return "可用口粮 "+f?["available"]+" · 每日基础维护 "+f?["daily"]+" · 约 "+f?["days"]+" 日";});
            DetailBind(()=>"当前提醒："+Snapshot?["uiCatalog"]?["journey"]?["risk"]);
            DetailText("已达成："+String.Join("、",(j["completed"] as JArray??new JArray()).Select(g=>(string)g["title"])),14,Gold);
            foreach(var c in j["choices"] as JArray??new JArray())DetailText(c["title"]+"："+c["instruction"]);
        }
        void UpdateLoopPresentation()
        {
            foreach(var f in progressFills)if(f.image!=null)f.image.rectTransform.anchorMax=new Vector2(f.value(),1);
            var j=Snapshot?["uiCatalog"]?["journey"];
            if(goalHud==null){goalHud=Label(root,"",16);var r=(RectTransform)goalHud.transform;r.anchorMin=r.anchorMax=new Vector2(.5f,1);r.pivot=new Vector2(.5f,1);r.anchoredPosition=new Vector2(0,-92);r.sizeDelta=new Vector2(520,76);goalHud.alignment=TextAnchor.MiddleCenter;goalHud.color=Gold;}
            goalHud.gameObject.SetActive(j!=null&&!view.InputBlocked&&!panelOpen);
            goalHud.text=j==null?"":(j["current"] is JObject?"当前目标 · "+j["current"]["title"]:"首轮积累已完成 · 选择扩张或防卫")+"\n已达成 "+j["progress"]+" / "+j["total"]+" · 打开营地查看下一步";
            PresentWorkshop();
        }
    }
}
