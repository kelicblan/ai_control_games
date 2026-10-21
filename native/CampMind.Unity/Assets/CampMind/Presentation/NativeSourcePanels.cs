using System;
using System.Linq;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace CampMind.Presentation
{
    public sealed partial class NativeGameUi
    {
        string decisionNpc,decisionRecord;bool decisionFeatures;
        static string ClockLabel(double elapsed){var clock=NativeCampClock.Read(elapsed);return $"{clock.Minutes/60:00}:{clock.Minutes%60:00}";}
        RectTransform SourceDialog(string title,float width,float height,bool drawer=false)
        {
            modal.anchorMin=modal.anchorMax=new Vector2(.5f,drawer?0:.5f);
            modal.pivot=new Vector2(.5f,drawer?0:.5f);
            modal.sizeDelta=new Vector2(width,height);modal.anchoredPosition=new Vector2(0,drawer?12:0);
            modal.GetComponentInChildren<NativeUiSurface>().Set(new Color32(36,60,44,255),new Color32(18,39,29,255),new Color32(146,163,114,110),drawer?22:17);
            var titleText=Label(modal,title,26,23,width-90,42,24);titleText.font=serif??font;titleText.fontStyle=FontStyle.Bold;
            IconButton(modal,"关闭","X",width-62,18,Close);
            return body=Rect("窗口内容",modal,Vector2.zero,Vector2.one,new Vector2(26,26),new Vector2(-26,-83));
        }
        RectTransform SourceScroll(Transform parent,string name,float top=0,float bottom=0)
        {
            var viewport=Rect(name,parent,Vector2.zero,Vector2.one,new Vector2(0,bottom),new Vector2(0,-top));
            viewport.gameObject.AddComponent<RectMask2D>();viewport.gameObject.AddComponent<Image>().color=Color.clear;
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;scroll.scrollSensitivity=32;
            var content=Rect("滚动内容",viewport,new Vector2(0,1),new Vector2(1,1),Vector2.zero,Vector2.zero);content.pivot=new Vector2(.5f,1);scroll.content=content;return content;
        }
        float Paragraph(Transform parent,string value,float x,float y,float width,int size=12,float line=1.8f)
        {
            var text=Label(parent,value??"",x,y,width,30,size);text.lineSpacing=line*Math.Max(1,font.fontSize)/Math.Max(1,font.lineHeight);
            var height=Mathf.Max(size*line,text.preferredHeight);Place((RectTransform)text.transform,x,y,width,height);return height;
        }
        void HelpPanel()
        {
            var data=JObject.Parse(Resources.Load<TextAsset>("HelpContent").text);
            SourceDialog((string)data["title"],630,916.6f);var content=SourceScroll(body,"操作说明");
            var y=Paragraph(content,(string)data["lead"],0,0,578,13,1.9f)+24;
            foreach(var section in data["sections"] as JArray)
            {
                var boxed=(bool)section["boxed"];var inset=boxed?16:0;var start=y;
                var area=At((string)section["title"],content,0,start,578,100);
                if(boxed){var image=area.gameObject.AddComponent<Image>();var surface=NativeUiSurface.Apply(image,12);surface.Set(new Color32(24,48,32,230),new Color32(24,48,32,230),new Color32(160,177,120,60),12);}
                Icon(area,(string)section["icon"],inset,boxed?16:0,20);
                var title=Label(area,(string)section["title"],inset+30,boxed?14:0,530-inset*2,27,15);title.fontStyle=FontStyle.Bold;title.color=new Color32(232,211,161,255);
                var height=Paragraph(area,(string)section["text"],inset,boxed?50:36,578-inset*2,12,1.9f)+(boxed?66:36);
                area.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,height);Place(area,0,start,578,height);y+=height+22;
            }
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y);
        }
        void WeatherPanel()
        {
            SourceDialog("风雨中的营地",480,853,true);var content=SourceScroll(body,"天气与伙伴");
            var atmosphere=view.World?["atmosphere"];var weather=(string)view.World?["weather"];
            var kinds=new[]{"wind","rain","storm","clear"};var icons=new[]{"Wind","CloudRain","CloudLightning","Sun"};
            var titles=new[]{"吹起山风","落下一场雨","唤来雷暴","让天空放晴"};var notes=new[]{"树梢摇动 · 火星飘散","人物淋湿 · 留意体力","雷声逼近 · 寻找遮蔽","雨歇风缓 · 继续劳作"};
            var y=Paragraph(content,villageHud?"山中的天气会随游戏时间变化。屋檐能挡雨，露天作业会淋湿并消耗体力。":"山里的天气随时会变。看看伙伴如何照顾自己，也照顾这一团火。",0,0,428,12)+20;
            var weatherCard=At("当前天气",content,0,y,428,100).gameObject.AddComponent<Image>();NativeUiSurface.Apply(weatherCard,14).Set(weather=="storm"?new Color32(47,55,62,255):new Color32(42,61,41,255),new Color32(22,43,33,255),weather=="storm"?new Color32(168,168,206,83):new Color32(167,189,163,61),14);
            var current=Array.IndexOf(kinds,weather);Icon(content,icons[Math.Max(0,current)],12,y+14,36);Label(content,"此刻的松林",64,y,350,20,10);
            var names=new[]{"山风渐起","林间阵雨","雷雨交加","林间晴朗"};var heading=Label(content,names[Math.Max(0,current)],64,y+23,350,30,22);heading.font=serif??font;
            var remaining=Math.Max(0,Math.Ceiling(((double?)view.World?["weatherUntil"]??0)-((double?)view.World?["elapsed"]??0)));
            Label(content,remaining>0?$"本轮天气还将持续约 {remaining} 个游戏秒":"天气会随旅程自然变化",64,y+61,350,26,10);y+=112;
            var meters=new[]{"风力","雨量","雨棚"};var values=new[]{(double?)atmosphere?["windStrength"]*100??0,(double?)atmosphere?["rainIntensity"]*100??0,(double?)view.World?["shelterIntegrity"]??0};
            for(var i=0;i<3;i++){var tile=At(meters[i],content,i*145,y-10,138,40).gameObject.AddComponent<Image>();NativeUiSurface.Apply(tile,8).Set(new Color32(19,41,31,150),new Color32(19,41,31,150),new Color32(152,178,138,50),8);Icon(content,i==2?"ShieldCheck":icons[i],i*145+7,y,16);Label(content,meters[i],i*145+30,y,42,20,10);Label(content,values[i].ToString("0")+"%",i*145+76,y,60,20,13);}y+=48;
            Label(content,"改变天气，观察下一步",0,y,428,24,13).fontStyle=FontStyle.Bold;y+=36;
            for(var i=0;i<4;i++){var kind=kinds[i];Card(content,titles[i],notes[i],icons[i],i%2*218,y+i/2*77,210,69,()=>view.SendCommand("weather",new JObject{["weather"]=kind}));}y+=164;
            y+=Paragraph(content,villageHud?"关闭窗口回到场景后，可观察风向、雨线与天空变化。":"每次触发都会写入手记。关闭窗口回到场景后，留意气泡、动作和篝火的变化。",0,y,428,10)+16;
            var projected=view.ExternalInputDriver?view.EnvironmentPresentation?["weather"]:view.Authority?.gate.Snapshot?["presentation"]?["weather"];
            Label(content,"北",21,y,35,20,9);Icon(content,"ArrowRight",12,y+27,29);var arrow=content.GetChild(content.childCount-1);arrow.localRotation=Quaternion.Euler(0,0,-((float?)atmosphere?["windAngle"]??0)*Mathf.Rad2Deg);
            Label(content,"风吹向"+projected?["toward"],66,y,350,25,13);y+=Paragraph(content,"来自"+projected?["from"]+"方 · 树梢、雨线和烟雾随风偏转\n方位以地图为准，北在上方",66,y+30,350,10)+47;
            var audio=GetComponent<NativeGameAudio>();Card(content,audio!=null&&audio.SoundEnabled?"环境音已开启":"听见这片营地","点击开启风雨、溪水与篝火声","Volume2",0,y,428,64,()=>{audio?.Toggle();Open("天气");});y+=82;
            Icon(content,"Waves",0,y+2,15);y+=Paragraph(content,"溪流顺河道向南，河心流得更快；风雨扰动水面。",24,y,404,10)+24;
            foreach(var npc in view.World?["npcs"] as JArray??new JArray())
            {
                var exposure=(projected?["crew"] as JArray)?.FirstOrDefault(n=>(string)n["npcId"]==(string)npc["id"]);
                Icon(content,(string)npc["id"],0,y,32);Label(content,(string)npc["name"],44,y,180,22,12);
                Label(content,(exposure==null?"遮蔽数据读取中":(double?)exposure["exposure"]<.3?"正在雨棚下":"位于露天")+" · 淋湿 "+Number(npc["wetness"])+"%",44,y+24,260,22,10).color=new Color32(165,188,147,255);
                Label(content,npc["action"]?.Type==JTokenType.String?Task((string)npc["action"]):"正在权衡",330,y+10,98,25,10);y+=60;
            }
            y+=Paragraph(content,"休息区的雨棚能挡雨。露天工作会淋湿，强风雨会影响体力和行动；伙伴会结合体力、性格与营地需要重新选择。",0,y+10,428,11)+30;
            Card(content,"查看伙伴的真实选择","天气输入 · 动作分数 · 模型或规则来源","Network",0,y,428,65,()=>Open("决策记录"));y+=85;
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y);
        }
        void JournalPanel()
        {
            var events=(view.World?["events"] as JArray??new JArray()).Reverse().ToArray();
            var eventHeight=events.Sum(e=>Mathf.Ceil(((string)e["text"]??"").Length/30f)*22.8f+19);
            SourceDialog("林间手记",480,228+Mathf.Clamp(eventHeight,140,464),true);
            Label(body,"记下今晚的劳作、相互照顾，还有一点小牢骚。",0,0,428,32,12).color=new Color32(175,194,156,255);
            var content=SourceScroll(body,"活动日志",50,82);var y=0f;
            if(events.Length==0){Icon(content,"BookOpen",199,20,30);var empty=Label(content,"篝火刚刚点亮。\n我们的故事，从这里开始。",0,65,428,60,12);empty.alignment=TextAnchor.MiddleCenter;y=140;}
            foreach(var item in events)
            {
                var dot=At("事件标记",content,0,y+9,7,7).gameObject.AddComponent<Image>();dot.color=(string)item["kind"]=="danger"?new Color32(224,149,112,255):new Color32(180,194,127,255);
                Label(content,ClockLabel((double?)item["time"]??0),17,y,37,23,10).color=new Color32(155,177,138,255);
                y+=Mathf.Max(23,Paragraph(content,(string)item["text"],65,y,360,12,1.9f))+19;
            }
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y);
            Card(body,"决策观察","看看伙伴为什么选择这份工作","BarChart3",0,body.rect.height-65,428,58,()=>Open("决策记录"));
        }
        Dropdown SourceSelect(Transform parent,string name,float x,float y,float width,string[] options,int selected,UnityEngine.Events.UnityAction<int> changed)
        {
            var rect=At(name,parent,x,y,width,38);var image=rect.gameObject.AddComponent<Image>();NativeUiSurface.Apply(image,7);
            var dropdown=rect.gameObject.AddComponent<Dropdown>();dropdown.targetGraphic=image;dropdown.transition=Selectable.Transition.None;
            dropdown.captionText=Label(rect,"",12,5,width-36,28,12);Label(rect,"▾",width-24,8,18,24,12);
            var template=At("选项列表",rect,0,38,width,Mathf.Min(240,options.Length*34+8));var background=template.gameObject.AddComponent<Image>();background.color=new Color32(27,48,35,255);
            var viewport=Rect("Viewport",template,Vector2.zero,Vector2.one,new Vector2(4,4),new Vector2(-4,-4));viewport.gameObject.AddComponent<RectMask2D>();
            var content=Rect("Content",viewport,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-34),Vector2.zero);content.pivot=new Vector2(.5f,1);
            var item=At("Item",content,0,0,width-8,34);var toggle=item.gameObject.AddComponent<Toggle>();var itemImage=item.gameObject.AddComponent<Image>();itemImage.color=new Color32(69,82,46,255);toggle.targetGraphic=itemImage;toggle.graphic=itemImage;
            dropdown.itemText=Label(item,"",8,4,width-26,26,12);dropdown.template=template;
            var scroll=template.gameObject.AddComponent<ScrollRect>();scroll.viewport=viewport;scroll.content=content;scroll.horizontal=false;scroll.scrollSensitivity=32;
            template.gameObject.SetActive(false);dropdown.AddOptions(options.ToList());dropdown.SetValueWithoutNotify(Mathf.Clamp(selected,0,Math.Max(0,options.Length-1)));dropdown.onValueChanged.AddListener(changed);return dropdown;
        }
        void DecisionPanel()
        {
            SourceDialog("决策观察",650,830);var content=SourceScroll(body,"决策详情",0,64);
            var npcs=view.World?["npcs"] as JArray??new JArray();if(!npcs.Any(n=>(string)n["id"]==decisionNpc))decisionNpc=view.SelectedNpc;
            var records=(view.World?["decisions"] as JArray??new JArray()).Where(d=>(string)d["npcId"]==decisionNpc).Reverse().ToArray();
            var record=records.FirstOrDefault(d=>(string)d["id"]==decisionRecord)??records.FirstOrDefault();
            var y=Paragraph(content,"从真实观测到实际动作。打开面板时旅程暂停，方便逐项检查。",0,0,598,12)+20;
            var stats=view.World?["stats"];var total=(double?)stats?["modelDecisions"]+(double?)stats?["ruleDecisions"]+(double?)stats?["fallbackDecisions"]??0;
            Icon(content,"Network",0,y,22);Label(content,"当前决策方式",32,y,260,18,10);Label(content,(string)view.World?["mode"]=="model"?"CampMind 神经网络":"规则策略对照",32,y+24,300,26,14);
            Label(content,"平均决策耗时",380,y,210,18,10);Label(content,total>0?(((double?)stats?["totalLatency"]??0)/total).ToString("0.000")+" ms":"—",380,y+24,210,26,14);y+=80;
            Label(content,"观察伙伴",0,y,280,20,11);Label(content,"决策记录",300,y,298,20,11);y+=26;
            SourceSelect(content,"观察伙伴",0,y,285,npcs.Select(n=>(string)n["name"]).ToArray(),npcs.ToList().FindIndex(n=>(string)n["id"]==decisionNpc),i=>{decisionNpc=(string)npcs[i]["id"];decisionRecord=null;Open("决策记录");});
            SourceSelect(content,"决策记录",300,y,298,records.Length==0?new[]{"暂无记录"}:records.Select(r=>$"#{r["id"]} · {((double?)r["time"]??0):0.0}s · {Task((string)r["action"])}").ToArray(),Array.IndexOf(records,record),i=>{if(records.Length>0){decisionRecord=(string)records[i]["id"];Open("决策记录");}});y+=65;
            if(record!=null)
            {
                Card(content,Task((string)record["action"]),((string)record["source"]=="model"?"真实模型输出":(string)record["source"]=="rules"?"规则输出":"异常回退")+" · "+((double?)record["latencyMs"]??0).ToString("0.000")+" ms","Activity",0,y,598,70,()=>{});y+=86;
                if(record["reason"]!=null)y+=Paragraph(content,(string)record["reason"],0,y,598,12)+16;
                var schema=JObject.Parse(Resources.Load<TextAsset>("DecisionSchema").text);var actions=schema["actions"] as JArray;var scores=record["scores"] as JArray??new JArray();var allowed=record["allowed"] as JArray;var max=scores.Count>0?scores.Max(s=>(float)s):1;var min=scores.Count>0?scores.Min(s=>(float)s):0;
                Label(content,"候选动作偏好",0,y,598,24,13).fontStyle=FontStyle.Bold;y+=35;
                for(var i=0;i<scores.Count&&i<actions.Count;i++)
                {
                    var valid=allowed==null||allowed.Any(a=>(string)a== (string)actions[i]);var action=(string)actions[i];Label(content,Task(action)+(action==(string)record["action"]?" ✓":""),0,y,100,26,12);
                    var track=At("候选偏好轨道",content,110,y+5,340,8).gameObject.AddComponent<Image>();track.color=new Color(1,1,1,.08f);
                    var fill=At("合法动作偏好",track.transform,0,0,valid?340*(.06f+.94f*((float)scores[i]-min)/(max-min==0?1:max-min)):0,8).gameObject.AddComponent<Image>();fill.color=new Color32(190,188,112,255);
                    Label(content,valid?((double)scores[i]).ToString("0.000"):"不可执行",470,y,128,26,11);y+=34;
                }
                y+=12;Button(content,(decisionFeatures?"▾ ":"▸ ")+"查看真实输入特征",0,y,598,38,()=>{decisionFeatures=!decisionFeatures;Open("决策记录");});y+=50;
                if(decisionFeatures){var features=record["features"] as JArray??new JArray();var names=schema["features"] as JArray;for(var i=0;i<features.Count;i++){Label(content,(i<names.Count?(string)names[i]:"feature"+i),i%2*300,y+i/2*27,210,25,11);Label(content,((double)features[i]).ToString("0.0000"),i%2*300+210,y+i/2*27,88,25,11);}y+=Mathf.Ceil(features.Count/2f)*27;}
            }
            else y+=Paragraph(content,"暂无记录。回到营地，让伙伴行动一会儿。",0,y,598,13)+20;
            y+=Paragraph(content,"分数表示合法动作掩码后的任务偏好，不是成功概率。台词来源在对话中单独标注。",0,y,598,11)+15;
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y);
            var feedback=Label(body,"",0,body.rect.height-16,598,16,9);
            Button(body,"导出真实记录",0,22,280,44,()=>PickFile(true,"导出真实记录","campmind-decisions.json",feedback,path=>{
                var schema=JObject.Parse(Resources.Load<TextAsset>("DecisionSchema").text);var payload=new JObject{["exportedAt"]=DateTime.UtcNow.ToString("o"),["model"]=null,["featureNames"]=schema["features"].DeepClone(),["actionOrder"]=schema["actions"].DeepClone()};
                foreach(var key in new[]{"seed","mode","difficulty","scenario","elapsed","weather","atmosphere","shelterIntegrity","stats","npcs","decisions","events","social"})payload[key]=view.World?[key]?.DeepClone();File.WriteAllText(path,payload.ToString());}),true);
            Button(body,"同一种子，新一轮对照",300,22,298,44,()=>{journeySeed=(string)view.World?["seed"];Open("开始旅程");},true);
        }
    }
}
