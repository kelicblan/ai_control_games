using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed partial class NativeGameUi
    {
        readonly Text[] referenceResources=new Text[6];Text referenceCamera,referenceWeather;RawImage referenceWeatherIcon;RectTransform channelEmpty;
        void ReferenceIcon(Transform owner,string asset,float x,float y,float size,Color? color=null){Icon(owner,asset,x,y,size);var image=owner.GetComponentsInChildren<RawImage>(true).Last();image.color=color??ReferenceUiArt.Gold;}
        Text ReferenceTool(Transform owner,string name,string icon,float x,Action action)
        {
            var text=Button(owner,name,x,0,46,44,()=>action());text.text="";ReferenceUiArt.Surface(text.GetComponentInParent<Button>().GetComponent<Image>(),false,7);ReferenceIcon(text.transform.parent,icon,12,11,22);return text;
        }
        void BuildReferenceTopHud()
        {
            var resources=Panel("物资",hud,new Vector2(0,1),new Vector2(0,1),new Vector2(16,-61),new Vector2(748,-15));ReferenceUiArt.Surface(resources.GetComponent<Image>());
            header=Label(resources,"",0,0,0,0,14);
            var names=new[]{"木材","食物","石料","绳索","围栏","存活伙伴"};var widths=new[]{122,118,118,118,114,132};var x=7f;
            for(var i=0;i<6;i++){ReferenceUiArt.Atlas(At(names[i]+"图标",resources,x,6,34,34),"ReferenceResources",i);referenceResources[i]=Label(resources,names[i]+" 0",x+37,11,widths[i]-38,27,18);referenceResources[i].horizontalOverflow=HorizontalWrapMode.Overflow;x+=widths[i];}
            var bar=Panel("时间控制",hud,new Vector2(.5f,1),new Vector2(.5f,1),new Vector2(-164,-61),new Vector2(338,-15));ReferenceUiArt.Surface(bar.GetComponent<Image>());
            var clock=At("生存天数与时钟",bar,12,0,244,46);
            dayText=Label(clock,"第1天",12,11,72,28,18);periodText=Label(clock,"早上",104,11,50,28,18);clockText=Label(clock,"06:07",172,11,70,28,20);
            Label(bar,"·",92,10,14,28,18);Label(bar,"·",170,10,14,28,18);
            var pause=Button(bar,"暂停 / 继续",264,-3,52,52,()=>Action(new JObject{["type"]="pause",["paused"]=(string)VillageProjection()?["status"]=="playing"}));pause.text="";var pauseSkin=ReferenceUiArt.Surface(pause.GetComponentInParent<Button>().GetComponent<Image>(),false,26);pauseSkin.BorderWidth=2;ReferenceIcon(pause.transform.parent,"PauseFill",16,16,20);
            for(var i=0;i<3;i++){var speed=new[]{1,2,4}[i];var text=Button(bar,speed+"倍",324+i*56,4,54,38,()=>Action(new JObject{["type"]="speed",["speed"]=speed}));text.text=speed+"×";text.fontSize=18;NativeUiSurface.Plain(text.GetComponentInParent<Button>().GetComponent<Image>());speedLabels.Add(text);var mark=At("选中速度边框",text.transform.parent,0,0,54,38).gameObject.AddComponent<Image>();var skin=NativeUiSurface.Apply(mark,4);skin.Shadow=false;skin.Set(Color.clear,Color.clear,ReferenceUiArt.Gold,4);skin.BorderWidth=1.5f;mark.raycastTarget=false;mark.transform.SetAsFirstSibling();speedMarks.Add(mark.gameObject);}
            var weather=Panel("天气状态",hud,new Vector2(.5f,1),new Vector2(.5f,1),new Vector2(-56,-104),new Vector2(56,-68));ReferenceUiArt.Surface(weather.GetComponent<Image>(),false,6);
            referenceWeather=Button(weather,"天气",0,0,112,36,()=>Open("天气"));referenceWeather.text="晴朗";referenceWeather.fontSize=16;Place((RectTransform)referenceWeather.transform,38,0,66,36);NativeUiSurface.Plain(referenceWeather.GetComponentInParent<Button>().GetComponent<Image>());ReferenceIcon(referenceWeather.transform.parent,"Sun",10,7,22);referenceWeatherIcon=referenceWeather.transform.parent.GetComponentInChildren<RawImage>();
            var tools=Rect("系统工具",hud,new Vector2(1,1),new Vector2(1,1),new Vector2(-180,-59),new Vector2(-16,-15));
            ReferenceTool(tools,"菜单","Settings",0,()=>Open("游戏设置"));audioState=ReferenceTool(tools,"环境声音","Volume2",58,()=>GetComponent<NativeGameAudio>()?.Toggle());ReferenceTool(tools,"玩法指南","CircleHelp",116,()=>Open("操作帮助"));
            var views=Panel("视角切换",hud,new Vector2(1,1),new Vector2(1,1),new Vector2(-326,-59),new Vector2(-196,-15));ReferenceUiArt.Surface(views.GetComponent<Image>(),false,7);
            referenceCamera=Button(views,"切换视角",0,0,130,44,()=>{view.lordView=!view.lordView;dispatch=false;view.Authority?.ReleaseMotion();});referenceCamera.text="上帝视角";referenceCamera.fontSize=16;referenceCamera.alignment=TextAnchor.MiddleRight;Place((RectTransform)referenceCamera.transform,40,2,82,40);NativeUiSurface.Plain(referenceCamera.GetComponentInParent<Button>().GetComponent<Image>());ReferenceIcon(referenceCamera.transform.parent,"Camera",12,12,24);
        }
        void RefreshReferenceHud(JObject state)
        {
            var village=GetComponent<NativeVillageUi>()?.Snapshot;var names=new[]{"木材","食物","石料","绳索","围栏","存活伙伴"};
            var values=new[]{Math.Floor((double?)state?["wood"]??0).ToString(),Math.Floor((double?)state?["food"]??0).ToString(),((int?)village?["inventory"]?["stone"]??0).ToString(),((int?)village?["inventory"]?["rope"]??0).ToString(),((int?)village?["economy"]?["fence"]?["level"]??1).ToString(),((state?["npcs"] as JArray)?.Count(n=>(bool?)n["alive"]!=false)??0).ToString()};
            for(var i=0;i<6;i++)referenceResources[i].text=names[i]+" "+values[i];
            var weather=(string)view.World?["weather"]??(string)state?["weather"]??"clear";referenceWeather.text=Weather(weather);referenceWeatherIcon.texture=Resources.Load<Texture2D>("Hud/"+(weather=="storm"?"CloudLightning":weather=="rain"?"CloudRain":weather=="wind"?"Wind":"Sun"));
            dayText.text=dayText.text.Replace(" ","");periodText.color=ReferenceUiArt.Ivory;referenceCamera.text=view.lordView?"领主视角":"上帝视角";referenceCamera.color=ReferenceUiArt.Gold;
            if(channelEmpty!=null)channelEmpty.gameObject.SetActive(!channel.Items.Any(m=>tab=="全部"||(tab=="频道")==m.Conversation));
        }
        void BuildReferenceChannel()
        {
            var owner=Panel("世界频道",hud,Vector2.zero,Vector2.zero,new Vector2(16,32),new Vector2(356,288));ReferenceUiArt.Surface(owner.GetComponent<Image>(),false,8);
            var labels=new[]{"世界频道","系统","队伍"};for(var i=0;i<3;i++){var category=new[]{"全部","系统","频道"}[i];var text=Button(owner,labels[i],6+i*82,7,78,32,()=>{tab=category;channelSignature="\0";Refresh();});text.fontSize=16;channelTabs.Add(text);}
            var more=Button(owner,"完整对话历史",296,7,34,32,()=>Open("对话历史"));more.text="";NativeUiSurface.Plain(more.GetComponentInParent<Button>().GetComponent<Image>());ReferenceIcon(more.transform.parent,"Settings",8,7,18,ReferenceUiArt.Muted);
            channelCount=Label(owner,"",0,0,0,0,14);channelCount.gameObject.SetActive(false);
            channelBody=Scroll(owner,"频道消息",new Vector2(14,14),new Vector2(-14,-52),out channelText);
            channelEmpty=Rect("频道空状态",owner,Vector2.zero,Vector2.one,new Vector2(14,14),new Vector2(-14,-52));
            var icon=ReferenceUiArt.Atlas(At("空消息图标",channelEmpty,130,52,52,52),"ReferenceUtility",5);icon.color=new Color32(137,159,139,255);icon.raycastTarget=false;
            var empty=Label(channelEmpty,"暂无新消息",0,114,312,28,16);empty.alignment=TextAnchor.MiddleCenter;empty.color=ReferenceUiArt.Muted;
        }
        void BuildReferenceAtlas()
        {
            var owner=Panel("世界鹰眼",hud,new Vector2(1,1),new Vector2(1,1),new Vector2(-270,-348),new Vector2(-16,-79));ReferenceUiArt.Surface(owner.GetComponent<Image>(),false,7);
            ReferenceIcon(owner,"Compass",12,10,18);Label(owner,"世界鹰眼",38,8,154,26,16).color=ReferenceUiArt.Gold;
            var expand=Button(owner,"展开",216,5,30,28,()=>Open("世界地图"));expand.text="";NativeUiSurface.Plain(expand.GetComponentInParent<Button>().GetComponent<Image>());var expandArt=ReferenceUiArt.Atlas(At("展开图标",expand.transform.parent,2,1,28,28),"ReferenceUtility",1);expandArt.color=ReferenceUiArt.Gold;
            var map=At("营地鹰眼地图",owner,9,38,236,222);map.gameObject.AddComponent<RawImage>();map.gameObject.AddComponent<NativeEagleMap>().Initialize(view);
        }
    }
}
