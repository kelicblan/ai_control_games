using System;
using System.Linq;
using System.Collections.Generic;
using System.Collections;
using System.Threading.Tasks;
using System.IO;
using System.Globalization;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;

namespace CampMind.Presentation
{
    [DefaultExecutionOrder(50)]
    public sealed class NativeGameUi:MonoBehaviour
    {
        NativeCampView view;
        RectTransform root,modal,modalBlocker,discardPrompt,body,channelBody;
        Text header,status,selection,channelText,audioState,modelStatus,clockText;
        readonly Text[] resourceValues=new Text[3];
        RectTransform commandDock,hud;
        string controlledNpc;
        bool journeyAdvanced;string journeyDifficulty="cozy",journeyMode="model",journeyScenario="standard",journeySeed="64138";
        readonly List<Text> crew=new List<Text>();
        readonly List<Image[]> crewMeters=new List<Image[]>();
        readonly NativeWorldChannel channel=new NativeWorldChannel();
        Font font;Sprite rounded;
        void Round(Image image){if(rounded==null){var texture=Resources.Load<Texture2D>("Hud/rounded");if(texture!=null)rounded=Sprite.Create(texture,new Rect(0,0,64,64),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,new Vector4(16,16,16,16));}image.sprite=rounded;image.type=Image.Type.Sliced;}
        NativeActorOverlay actorOverlay;
        float nextRefresh,nextModelPoll;
        string modelStage="等待加载";
        string tab="全部",page="",channelSignature="";
        string socialSignature="";
        string lastError="";float errorUntil;
        bool dispatch;
        string dispatchScope,dispatchNpc;
        bool dispatchLordView;
        Vector2 pointerStart;
        bool scenePointer,sceneMoved;
        static readonly Key[] NumberKeys={Key.Digit1,Key.Digit2,Key.Digit3,Key.Digit4,Key.Digit5,Key.Digit6,Key.Digit7,Key.Digit8,Key.Digit9};
        public bool DispatchArmed=>dispatch;
        bool settingsDirty,resumeOnClose,previousBlocked;
        int panelVersion;
        bool waitingForStart;
        string startScope;
        float startDeadline;
        public bool HasControl(string name)=>root!=null&&root.GetComponentsInChildren<Transform>(true).Any(t=>t.name==name);
        public Canvas Canvas=>root==null?null:root.GetComponent<Canvas>();
        public void Initialize(NativeCampView target)
        {
            if(root!=null)return;view=target;
            font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular");
            if(font==null)throw new InvalidOperationException("缺少随游戏发布的中文字体");
            root=Rect("营地游戏界面",null,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);
            root.localScale=Vector3.one;root.localRotation=Quaternion.identity;
            var canvas=root.gameObject.AddComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            var scaler=root.gameObject.AddComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1920,1080);scaler.matchWidthOrHeight=.5f;
            root.gameObject.AddComponent<GraphicRaycaster>();
            var actors=Rect("角色头顶反馈",root,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);actors.gameObject.AddComponent<Canvas>();actorOverlay=actors.gameObject.AddComponent<NativeActorOverlay>();
            actorOverlay.Initialize(view,font,id=>channel.Items.LastOrDefault(m=>m.NpcId==id&&m.Conversation));
            if(Application.isPlaying&&EventSystem.current==null){var es=new GameObject("营地输入",typeof(EventSystem),typeof(InputSystemUIInputModule));es.transform.SetParent(root,false);}
            hud=Rect("原版边缘HUD",root,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);
            var top=Rect("营地状态",hud,new Vector2(0,1),new Vector2(1,1),new Vector2(12,-52),new Vector2(-12,-12));
            Icon(top,"Flame",0,4,30);Label(top,"今晚别挨饿",38,0,145,25,18);Label(top,"CAMPMIND",40,27,145,13,8);
            var resources=Panel("物资",top,Vector2.zero,Vector2.zero,Vector2.zero,Vector2.zero);Place(resources,196,0,340,40);
            header=Label(resources,"",0,0,1,1,1);
            var resourceNames=new[]{"木材","食物","篝火"};var resourceIcons=new[]{"Axe","Apple","Flame"};for(var i=0;i<3;i++){var x=10+i*110;Icon(resources,resourceIcons[i],x,11,18);Label(resources,resourceNames[i],x+24,12,28,20,10);resourceValues[i]=Label(resources,"",x+55,7,45,28,17);}
            var timebar=Rect("时间控制",top,Vector2.zero,Vector2.zero,Vector2.zero,Vector2.zero);Place(timebar,548,0,500,40);
            IconButton(timebar,"天气","Sun",0,0,()=>Open("天气"));
            clockText=Label(timebar,"",50,3,130,34,13);
            IconButton(timebar,"暂停 / 继续","Pause",190,0,()=>Action(new JObject{["type"]="pause",["paused"]=(string)view.World?["status"]=="playing"}));
            for(var i=0;i<3;i++){var speed=new[]{1,2,4}[i];var t=Button(timebar,speed+"倍",240+i*44,0,42,40,()=>Action(new JObject{["type"]="speed",["speed"]=speed}));t.text=speed+"×";t.fontSize=11;}
            var tools=Rect("系统工具",top,new Vector2(1,0),new Vector2(1,1),new Vector2(-132,0),Vector2.zero);
            IconButton(tools,"菜单","Settings",0,0,()=>Open("游戏设置"));
            audioState=IconButton(tools,"环境声音","Volume2",44,0,()=>GetComponent<NativeGameAudio>()?.Toggle());
            IconButton(tools,"玩法指南","CircleHelp",88,0,()=>Open("操作帮助"));
            var left=Rect("伙伴列表",hud,new Vector2(0,1),new Vector2(0,1),new Vector2(12,-404),new Vector2(122,-64));
            var ids=new[]{"azhuang","xiaomi","laozhou","linlan","aye","tiesheng","aling","xiaoman","shenyan"};
            for(var i=0;i<ids.Length;i++){var id=ids[i];var x=i%2*56;var y=i/2*68;var t=Button(left,id,x,y,52,64,()=>{controlledNpc=controlledNpc==id?null:id;view.SelectNpc(id);dispatch=false;});crew.Add(t);t.fontSize=10;t.alignment=TextAnchor.LowerCenter;Icon(t.transform.parent,id,5,1,42);var meters=new Image[2];for(var m=0;m<2;m++){var r=At("生命状态条",t.transform.parent,10+m*17,61,15,2);meters[m]=r.gameObject.AddComponent<Image>();meters[m].raycastTarget=false;meters[m].color=m==0?new Color(.62f,.76f,.45f):new Color(.85f,.53f,.38f);}crewMeters.Add(meters);}
            var right=Panel("世界频道",hud,new Vector2(0,0),new Vector2(0,0),new Vector2(12,12),new Vector2(332,452));
            Label(right,"世界频道",11,8,155,24,13);Button(right,"完整对话历史",238,5,70,28,()=>Open("对话历史")).text="更多";
            for(var i=0;i<3;i++){var category=new[]{"全部","系统","频道"}[i];var t=Button(right,category,3,42+i*44,37,40,()=>{tab=category;channelSignature="";Refresh();});t.fontSize=11;}
            channelBody=Scroll(right,"频道消息",new Vector2(47,8),new Vector2(-10,-40),out channelText);
            var atlasPanel=Panel("世界鹰眼",hud,new Vector2(1,1),new Vector2(1,1),new Vector2(-252,-316),new Vector2(-12,-64));
            Label(atlasPanel,"N ↑ 世界鹰眼",8,3,150,24,12);Button(atlasPanel,"展开",178,2,54,26,()=>Open("世界地图")).fontSize=11;
            var atlasRect=At("营地鹰眼地图",atlasPanel,8,32,224,212);atlasRect.gameObject.AddComponent<RawImage>();atlasRect.gameObject.AddComponent<NativeWorldAtlas>().Initialize(view);
            var views=Panel("视角切换",hud,new Vector2(1,1),new Vector2(1,1),new Vector2(-460,-52),new Vector2(-160,-12));
            Button(views,"上帝视角",4,4,140,32,()=>{view.lordView=false;dispatch=false;view.Authority?.ReleaseMotion();}).fontSize=12;
            Button(views,"领主视角",150,4,140,32,()=>{view.lordView=true;dispatch=false;view.Authority?.ReleaseMotion();}).fontSize=12;
            commandDock=Panel("任务与交互",hud,new Vector2(.5f,0),new Vector2(.5f,0),new Vector2(-240,12),new Vector2(240,64));
            selection=Button(commandDock,"伙伴互动",3,3,76,46,()=>Open("伙伴互动"));selection.fontSize=11;
            var labels=new[]{"派遣到地图","伐木","采食","休息","互助","狩猎"};var actions=new[]{"move","wood","food","rest","help","hunt"};var icons=new[]{"MapPin","Axe","Apple","BedDouble","HeartHandshake","Compass"};
            for(var i=0;i<labels.Length;i++){var action=actions[i];var t=Button(commandDock,labels[i],83+i*65,3,63,46,()=>{if(action=="move"){if(view.lordView)return;dispatch=!dispatch;dispatchScope=view.Authority?.gate.Scope;dispatchNpc=view.SelectedNpc;dispatchLordView=view.lordView;}else if(action=="hunt")Command("hunt");else Command("assign",new JObject{["action"]=action});});t.text=i==0?"派遣":labels[i];t.fontSize=11;t.alignment=TextAnchor.MiddleRight;Icon(t.transform.parent,icons[i],4,14,18);}
            var utility=Rect("营地快捷入口",hud,new Vector2(1,0),new Vector2(1,0),new Vector2(-56,12),new Vector2(-12,104));
            IconButton(utility,"林间手记","BookOpen",0,0,()=>Open("营地日志"));IconButton(utility,"营地选项","House",0,46,()=>Open("营地管理"));
            status=Label(hud,"",580,62,660,25,12);
            modalBlocker=Panel("菜单遮罩",root,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);modalBlocker.GetComponent<Image>().color=new Color(0,0,0,.35f);modalBlocker.gameObject.SetActive(false);
            modal=Panel("功能窗口",root,new Vector2(.5f,.5f),new Vector2(.5f,.5f),new Vector2(-500,-370),new Vector2(500,370));modal.gameObject.SetActive(false);
            Refresh();
        }
        void Update()
        {
            if(view==null)return;
            if(dispatch&&(dispatchScope!=view.Authority?.gate.Scope||dispatchNpc!=view.SelectedNpc||dispatchLordView!=view.lordView))dispatch=false;
            var selectedObject=EventSystem.current?.currentSelectedGameObject;
            view.InputBlocked=modal.gameObject.activeSelf||selectedObject?.GetComponent<InputField>()!=null;
            view.PointerBlocked=EventSystem.current?.IsPointerOverGameObject()==true;
            if(view.InputBlocked&&!previousBlocked)view.Authority?.ReleaseMotion();previousBlocked=view.InputBlocked;
            if(Keyboard.current?.escapeKey.wasPressedThisFrame==true){if(dispatch)dispatch=false;else if(modal.gameObject.activeSelf)Close();else {controlledNpc=null;Open("菜单");}}
            SceneMouse();Shortcuts(selectedObject);
            if(Time.unscaledTime>=nextRefresh){nextRefresh=Time.unscaledTime+.2f;Refresh();}
        }
        void OnApplicationFocus(bool value){if(!value)scenePointer=false;}
        void OnDestroy(){if(root!=null){if(Application.isPlaying)Destroy(root.gameObject);else DestroyImmediate(root.gameObject);}}
        void SceneMouse()
        {
            var mouse=Mouse.current;if(mouse==null||view.InputBlocked){scenePointer=false;return;}
            if(mouse.leftButton.wasPressedThisFrame&&!view.PointerBlocked){scenePointer=true;sceneMoved=false;pointerStart=mouse.position.ReadValue();}
            if(!scenePointer)return;
            if(Vector2.Distance(mouse.position.ReadValue(),pointerStart)>6)sceneMoved=true;
            if(mouse.leftButton.isPressed&&sceneMoved&&!view.PointerBlocked){if(view.lordView)view.ApplyPointerInput(mouse.delta.ReadValue(),0,true);else view.ApplyPanInput(mouse.delta.ReadValue(),Screen.height);}
            if(!mouse.leftButton.wasReleasedThisFrame)return;scenePointer=false;
            if(sceneMoved||view.PointerBlocked||view.lordView)return;
            var ray=view.viewCamera.ScreenPointToRay(mouse.position.ReadValue());
            if(dispatch){if(Physics.Raycast(ray,out var hit,4000,1<<9)){var logical=view.Space.ToLogical(hit.point);Command("move",new JObject{["target"]=new JObject{["x"]=logical.x,["y"]=logical.y}});dispatch=false;}}
            else{var id=view.PickNpc(ray);if(id!=null){controlledNpc=null;view.SelectNpc(id);}}
        }
        void Shortcuts(GameObject selectedObject)
        {
            var key=Keyboard.current;if(key==null||view.InputBlocked||key.ctrlKey.isPressed||key.altKey.isPressed||key.leftMetaKey.isPressed||key.rightMetaKey.isPressed)return;
            var people=view.World?["npcs"] as JArray;
            for(var i=0;i<NumberKeys.Length;i++)if(key[NumberKeys[i]].wasPressedThisFrame&&people?.ElementAtOrDefault(i)!=null){controlledNpc=null;view.SelectNpc((string)people[i]["id"]);dispatch=false;}
            if(key.spaceKey.wasPressedThisFrame&&selectedObject?.GetComponent<Button>()==null)Action(new JObject{["type"]="pause",["paused"]=(string)view.World?["status"]=="playing"});
            var action=key.qKey.wasPressedThisFrame?"wood":key.wKey.wasPressedThisFrame&&!view.lordView?"food":key.rKey.wasPressedThisFrame?"rest":key.tKey.wasPressedThisFrame?"help":null;
            if(action!=null&&controlledNpc==view.SelectedNpc)Command("assign",new JObject{["action"]=action});
        }
        void Action(JObject action){view.Authority?.Enqueue(action);}
        void Command(string type,JObject extra=null){extra=extra??new JObject();extra["npcId"]=view.SelectedNpc;view.SendCommand(type,extra);}
        void Refresh()
        {
            var state=view.World;var bridge=view.Authority;
            if(waitingForStart)
            {
                if(state!=null&&bridge?.gate.Scope!=startScope){waitingForStart=false;resumeOnClose=false;Close();}
                else if(Time.unscaledTime>startDeadline||!string.IsNullOrEmpty(bridge?.Error)){waitingForStart=false;status.text=bridge?.Error??"开始旅程超时，请重试";}
            }
            if(!string.IsNullOrEmpty(bridge?.Error)&&lastError!=bridge.Error){lastError=bridge.Error;errorUntil=Time.unscaledTime+5;}
            if(page=="游戏设置"&&modelStatus!=null)
            {
                modelStatus.text=$"当前认知绑定：{state?["agency"]?["modelId"]??"MiniMind3"} · 自主行为 {((bool?)state?["agency"]?["enabled"]==false?"关闭":"开启")} · 大模型认知 {((bool?)state?["agency"]?["cognition"]==true?"开启":"关闭")}\n本地模型：{modelStage}";
                if(Time.unscaledTime>=nextModelPoll){nextModelPoll=Time.unscaledTime+2;var version=panelVersion;bridge?.Api("/game-api/native-models",null,(result,error)=>{if(version!=panelVersion)return;var stage=(string)result?["status"]?["stage"];modelStage=error??(stage=="ready"?"已就绪":stage=="error"?"加载失败":stage=="idle"?"等待加载":"加载中");});}
            }
            header.text=state==null?"木材 0    食物 0    篝火 熄灭":$"木材 {Math.Floor((double)state["wood"])}    食物 {Math.Floor((double)state["food"])}    篝火 {((double)state["fire"]>0?"燃烧":"熄灭")}";
            resourceValues[0].text=Math.Floor((double?)state?["wood"]??0).ToString();resourceValues[1].text=Math.Floor((double?)state?["food"]??0).ToString();resourceValues[2].text=((double?)state?["fire"]??0)>0?"燃烧":"熄灭";header.text="";
            var elapsed=(double?)state?["elapsed"]??0;var minutes=(int)(360+(elapsed%600)/600*1440)%1440;
            clockText.text=state==null?"":$"第 {state["day"]} 天   {minutes/60:00}:{minutes%60:00}";
            status.text=bridge==null?"正在启动本地世界…":!bridge.Connected?"连接中："+bridge.Error:!bridge.ReadyForActions?"正在恢复离线世界…":dispatch?"点击地图指定目的地 · Esc 取消":"";
            if(Time.unscaledTime<errorUntil)status.text=lastError;
            commandDock.gameObject.SetActive(state!=null&&controlledNpc==view.SelectedNpc&&!modal.gameObject.activeSelf);
            var npcs=state?["npcs"] as JArray;
            for(var i=0;i<crew.Count;i++){var n=npcs?.ElementAtOrDefault(i);crew[i].text=n==null?"":(string)n["name"];crew[i].GetComponentInParent<Button>().targetGraphic.color=(string)n?["id"]==view.SelectedNpc?new Color(.25f,.31f,.19f,.95f):new Color(.08f,.16f,.12f,.75f);for(var m=0;m<2;m++)crewMeters[i][m].rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal,15*Mathf.Clamp01(((float?)n?[m==0?"energy":"hunger"]??0)/100));}
            var npc=npcs?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);selection.text=npc==null?"":$"{npc["name"]}⌃\n{Task((string)npc["action"])}";
            if(bridge?.gate.Snapshot!=null)channel.Capture(bridge.gate.Snapshot);
            actorOverlay.Present(state);
            var text=string.Join("\n\n",channel.Items.Where(m=>tab=="全部"||(tab=="频道")==m.Conversation).Select(m=>$"{m.Speaker}{(string.IsNullOrEmpty(m.Recipients)?"":" → "+m.Recipients)}{(string.IsNullOrEmpty(m.Source)?"":" ["+m.Source+"]")}\n{m.Text}"));
            if(channelSignature!=text)
            {
                channelSignature=text;channelText.text="";channelText.GetComponent<ContentSizeFitter>().verticalFit=ContentSizeFitter.FitMode.Unconstrained;
                foreach(Transform child in channelBody)Destroy(child.gameObject);
                var y=0f;
                foreach(var message in channel.Items.Where(m=>tab=="全部"||(tab=="频道")==m.Conversation))
                {
                    var value=$"{message.Speaker}{(string.IsNullOrEmpty(message.Recipients)?"":" → "+message.Recipients)}{(string.IsNullOrEmpty(message.Source)?"":" ["+message.Source+"]")}\n{message.Text}";
                    var label=Label(channelBody,value,0,y,253,200,12);var height=Mathf.Max(56,label.preferredHeight+12);var rect=(RectTransform)label.transform;rect.offsetMin=new Vector2(0,-y-height);rect.offsetMax=new Vector2(253,-y);y+=height;
                    if(!string.IsNullOrEmpty(message.NpcId)&&message.Recipients.Contains("领主"))
                    {var id=message.NpcId;Button(channelBody,"回应 "+message.Speaker,0,y,150,32,()=>{view.SelectNpc(id);Open("伙伴互动");});y+=40;}
                }
                if(y==0)Label(channelBody,"暂无消息",0,0,253,50,12);
                channelBody.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Mathf.Max(y,50));
            }
            if(state==null&&!waitingForStart&&bridge?.ReadyForActions==true&&!modal.gameObject.activeSelf)Open("开始旅程");
            if(page=="伙伴互动"&&SocialSignature()!=socialSignature)Open("伙伴互动");
        }
        string SocialSignature()=>view.SelectedNpc+":"+view.World?["social"]?["revision"]+":"+view.World?["socialLife"]?["sequence"]+":"+view.World?["socialLife"]?["choices"]?.ToString(Newtonsoft.Json.Formatting.None)+":"+view.Authority?.gate.Snapshot?["moderationVersion"];
        static string Number(JToken token)=>((double?)token??0).ToString("0");
        static string Weather(string value)=>value=="storm"?"雷暴":value=="rain"?"降雨":value=="wind"?"大风":"晴朗";
        static string Task(string value){var ids=new[]{"wood","food","fire","eat","rest","help","camp","explore"};var names=new[]{"伐木","采食","添柴","进食","休息","互助","返回营地","探索"};var index=Array.IndexOf(ids,value??"");return index<0?"自主行动":names[index];}
        void Close()
        {
            if(waitingForStart)return;
            if(discardPrompt!=null){Destroy(discardPrompt.gameObject);discardPrompt=null;return;}
            if(settingsDirty){ConfirmDiscard(Close);return;}
            modal.gameObject.SetActive(false);modalBlocker.gameObject.SetActive(false);commandDock.gameObject.SetActive(view.World!=null&&controlledNpc==view.SelectedNpc);modalBlocker.GetComponent<Image>().color=new Color(0,0,0,.35f);page="";panelVersion++;
            if(resumeOnClose){resumeOnClose=false;Action(new JObject{["type"]="pause",["paused"]=false,["temporary"]=true});}
        }
        void ConfirmDiscard(Action next)
        {
            if(discardPrompt!=null)return;
            discardPrompt=Panel("未保存修改",modal,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);
            Label(discardPrompt,"有未保存的角色修改，是否放弃？",70,180,850,70,25);
            Button(discardPrompt,"保留修改，返回",70,300,350,60,()=>{Destroy(discardPrompt.gameObject);discardPrompt=null;});
            Button(discardPrompt,"放弃未保存修改",470,300,350,60,()=>{settingsDirty=false;Destroy(discardPrompt.gameObject);discardPrompt=null;next();});
        }
        void Open(string name)
        {
            if(settingsDirty&&page!=name){ConfirmDiscard(()=>Open(name));return;}
            if(!modal.gameObject.activeSelf&&(string)view.World?["status"]=="playing"){resumeOnClose=true;Action(new JObject{["type"]="pause",["paused"]=true,["temporary"]=true});}
            dispatch=false;page=name;panelVersion++;commandDock.gameObject.SetActive(false);
            foreach(Transform child in modal)Destroy(child.gameObject);
            modal.gameObject.SetActive(true);
            modalBlocker.gameObject.SetActive(true);
            modal.offsetMin=new Vector2(-500,-370);modal.offsetMax=new Vector2(500,370);
            if(name=="开始旅程"){Journey();return;}
            Label(modal,name,24,15,800,48,28);Button(modal,"关闭",870,20,100,40,Close);
            body=Rect("窗口内容",modal,new Vector2(0,0),new Vector2(1,1),new Vector2(24,24),new Vector2(-24,-82));
            var campTabs=new[]{"伙伴互动","状态与记忆","性格与关系","营地管理"};
            if(campTabs.Contains(name))
            {
                for(var i=0;i<campTabs.Length;i++){var entry=campTabs[i];Button(body,entry,i*235,0,224,42,()=>Open(entry));}
                body=Rect("营地页签内容",body,Vector2.zero,Vector2.one,Vector2.zero,new Vector2(0,-62));
            }
            if(name=="菜单")
            {
                var pages=new[]{"继续游戏","开始旅程","伙伴互动","状态与记忆","性格与关系","营地管理","决策记录","营地日志","天气","对话历史","游戏设置","远程模型","角色初始设置","世界地图","保存进度副本","操作帮助","退出游戏"};
                for(var i=0;i<pages.Length;i++){var entry=pages[i];Button(body,entry,(i%3)*310,(i/3)*85,290,64,()=>{if(entry=="继续游戏")Close();else if(entry=="退出游戏")Quit();else Open(entry);});}return;
            }
            if(name=="天气") {var kinds=new[]{"clear","wind","rain","storm"};for(var i=0;i<4;i++){var kind=kinds[i];Button(body,Weather(kind),i*210,20,190,55,()=>view.SendCommand("weather",new JObject{["weather"]=kind}));}return;}
            if(name=="伙伴互动"){SocialPanel();return;}
            if(name=="营地管理") {var values=new[]{"balanced","wood","food"};var labels=new[]{"均衡发展","优先木材","优先食物"};for(var i=0;i<3;i++){var priority=values[i];Button(body,labels[i],i*260,20,240,50,()=>view.SendCommand("priority",new JObject{["priority"]=priority}));}Button(body,"召回全部伙伴",0,110,240,50,()=>view.SendCommand("recall"));Button(body,"寨门开关",260,110,240,50,()=>view.SendCommand("gate-toggle"));return;}
            if(name=="游戏设置"){GameSettings();return;}
            if(name=="确认重置") {var error=Label(body,"确认清除当前世界与历史？模型配置与角色初始设置保留。",0,0,900,60,23);Button(body,"确认重置世界",0,100,300,52,()=>{try{Action(new JObject{["type"]="reset",["npcSettings"]=new NativeNpcSettings().Load()});Close();}catch(Exception e){error.text=e.Message;}});return;}
            if(name=="对话历史"){History();return;}
            if(name=="远程模型"){RemoteModels();return;}
            if(name=="角色初始设置"){NpcSettings();return;}
            if(name=="世界地图")
            {
                var map=At("鹰眼地图",body,0,0,560,560);map.gameObject.AddComponent<RawImage>();var atlas=map.gameObject.AddComponent<NativeWorldAtlas>();atlas.Initialize(view,true);
                Label(body,"N ↑\n点击地图定位镜头\n拖动浏览 · 滚轮缩放\n黑色为尚未探索区域\n移动镜头不会探索",590,0,300,220,21);
                Button(body,"镜头返回营地",590,250,290,48,atlas.Home);Button(body,"跟随选中伙伴",590,320,290,48,atlas.Follow);
                Button(body,"扩大地图范围",590,390,290,48,()=>atlas.Zoom(1.5f));Button(body,"缩小地图范围",590,460,290,48,()=>atlas.Zoom(1/1.5f));return;
            }
            if(name=="保存进度副本")
            {
                var feedback=Label(body,"世界会自动保存。此处导出可携带的进度 JSON 副本。",0,0,900,70,21);
                Button(body,"导出进度 JSON",0,100,300,52,()=>PickFile(true,"导出营地进度","campmind-save.json",feedback,destination=>{if(view.World==null)throw new InvalidOperationException("当前没有世界进度");File.WriteAllText(destination,view.World.ToString());feedback.text="进度副本已保存";}));return;
            }
            string content;
            if(name=="操作帮助")content="领主视角：WASD 移动，左键或右键拖动旋转\n上帝视角：左键拖动平移，右键拖动旋转\n滚轮：缩放镜头\n1–9：选择伙伴\nQ / W / R / T：伐木 / 采食 / 休息 / 互助（领主视角 W 用于移动）\n空格：暂停 / 继续\nTab：切换领主 / 上帝视角\nHome：恢复镜头\nEsc：取消派遣 / 关闭菜单\n\n派遣必须先切换上帝视角，点击‘派遣到地图’，再点击地图。\n\n世界自动保存。暂停时不会继续消耗资源。篝火随木材库存亮灭，无需添柴。";
            else if(name=="营地日志")content=string.Join("\n\n",(view.World?["events"] as JArray??new JArray()).Reverse().Select(e=>(string)e["text"]));
            else if(name=="决策记录")content=string.Join("\n\n",(view.World?["decisions"] as JArray??new JArray()).Reverse().Take(100).Select(d=>$"{d["npcId"]} · {Task((string)d["action"])} · {d["source"]} · {d["latencyMs"]}ms\n允许行动：{d["allowed"]}\n评分：{d["scores"]}\n特征：{d["features"]}"));
            else if(name=="对话历史")content=string.Join("\n\n",channel.Items.Where(m=>m.Conversation).Select(m=>$"{m.Speaker} → {m.Recipients}\n{m.Text}"));
            else content=PartnerDescription(name);
            if(name=="状态与记忆")
            {
                Scroll(body,name+"内容",new Vector2(0,70),Vector2.zero,out var memoryText);memoryText.text=content;
                string cursor=null,generation=null,branch=null;var version=panelVersion;var npcId=view.SelectedNpc;var records=new List<string>();
                Button(body,"加载更早经历",0,0,240,48,()=>{
                    var query="/game-api/memories?npc="+Uri.EscapeDataString(npcId)+(cursor==null?"":"&before="+cursor)+(generation==null?"":"&generation="+Uri.EscapeDataString(generation)+"&branch="+Uri.EscapeDataString(branch));
                    view.Authority?.Api(query,null,(result,error)=>{if(version!=panelVersion)return;if(error!=null){memoryText.text=error;return;}
                        generation=(string)result["generation"];branch=(string)result["branch"];cursor=(string)result["cursor"];
                        records.AddRange((result["items"] as JArray??new JArray()).Select(e=>$"{e["fact"]}\n{e["interpretation"]}"));memoryText.text=string.Join("\n\n",records);});
                },true);return;
            }
            Scroll(body,name+"内容",Vector2.zero,Vector2.zero,out var text);text.text=string.IsNullOrEmpty(content)?"暂无记录":content;
        }
        void History()
        {
            Scroll(body,"全部历史记录",new Vector2(0,70),new Vector2(0,-45),out var text);
            var info=Label(body,"读取中…",0,0,900,40,20);var version=panelVersion;var current=1;var pages=1;string through=null,scope=null;
            void Load(int next,bool refresh=false)
            {
                if(refresh){through=null;scope=null;}text.text="正在读取…";
                view.Authority?.Api("/game-api/conversations?page="+next+(through==null?"":"&through="+through+"&scope="+Uri.EscapeDataString(scope)),null,(result,error)=>{
                    if(version!=panelVersion)return;if(error!=null){text.text=error;return;}
                    current=(int)result["page"];pages=(int)result["pages"];through=(string)result["through"];scope=(string)result["scope"];
                    info.text=$"共 {result["total"]} 条 · 第 {current} / {pages} 页";
                    text.text=string.Join("\n\n",(result["items"] as JArray??new JArray()).Select(m=>$"{m["speaker"]} → {string.Join("、",(m["recipients"] as JArray??new JArray()).Select(x=>(string)x))}\n{m["text"]}"));
                });
            }
            Button(body,"上一页",0,0,160,44,()=>{if(current>1)Load(current-1);},true);
            Button(body,"下一页",180,0,160,44,()=>{if(current<pages)Load(current+1);},true);
            Button(body,"刷新历史",360,0,180,44,()=>Load(1,true),true);Load(1);
        }
        void SocialPanel()
        {
            socialSignature=SocialSignature();var person=(view.World?["npcs"] as JArray)?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);var alive=(bool?)person?["alive"]!=false;
            Label(body,(string)person?["name"]??"选择伙伴",0,0,900,36,24);
            var verbs=new[]{"praise","urge","feed","rescue","social-open"};var names=new[]{"鼓励","催促","分食（1 份）","救治（2 份）","发起交谈"};
            for(var i=0;i<verbs.Length;i++){var verb=verbs[i];var label=Button(body,names[i],i*184,45,172,44,()=>Command(verb));label.GetComponentInParent<Button>().interactable=alive&&(verb!="feed"||(double?)view.World?["food"]>=1)&&(verb!="rescue"||(double?)view.World?["food"]>=2&&(double?)person?["health"]<=25);}
            var topics=new[]{"checkin","work","food","weather","conflict","promise"};var topicNames=new[]{"近况","分工","口粮","天气","矛盾","承诺"};
            for(var i=0;i<topics.Length;i++){var topic=topics[i];Button(body,topicNames[i],i*154,100,144,36,()=>Command("social-open",new JObject{["topic"]=topic}));}
            var viewport=Rect("交谈滚动区",body,Vector2.zero,Vector2.one,new Vector2(0,60),new Vector2(0,-150));viewport.gameObject.AddComponent<RectMask2D>();var hit=viewport.gameObject.AddComponent<Image>();hit.color=Color.clear;
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;
            var content=Rect("交谈与安排",viewport,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-2000),Vector2.zero);content.pivot=new Vector2(.5f,1);scroll.content=content;var y=0;
            var messages=(view.World?["socialLife"]?["messages"] as JArray??new JArray()).Where(m=>(string)m["from"]==view.SelectedNpc||(m["to"] as JArray)?.Any(t=>(string)t==view.SelectedNpc)==true).TakeLast(12);
            foreach(var message in messages){Label(content,$"{((string)message["from"]=="player"?"领主":(string)person?["name"])} [{message["source"]}]\n{message["text"]}",0,y,900,76,18);y+=84;}
            foreach(var set in (view.World?["socialLife"]?["choices"] as JArray??new JArray()).Where(s=>(string)s["npcId"]==view.SelectedNpc&&(double?)s["expiresAt"]>=(double?)view.World?["elapsed"]))
            {
                var setId=(string)set["id"];var scope=view.Authority?.gate.Scope;
                foreach(var choice in set["options"] as JArray??new JArray()){var choiceId=(string)choice["id"];var label=Button(content,(string)choice["text"],0,y,900,48,()=>Action(new JObject{["type"]="social-choice",["setId"]=setId,["choiceId"]=choiceId,["scope"]=scope}));label.GetComponentInParent<Button>().interactable=alive&&(string)choice["text"]!="内容审核中。";y+=56;}
                Button(content,"更换一批回复",0,y,260,42,()=>Action(new JObject{["type"]="social-refresh",["setId"]=setId,["scope"]=scope}));y+=50;
            }
            foreach(var set in view.Authority?.gate.Snapshot?["presentation"]?["socialChoices"] as JArray??new JArray())if((string)set["npcId"]==view.SelectedNpc)
                foreach(var choice in set["options"] as JArray??new JArray())
                {var thread=set["threadId"].DeepClone();var choiceId=(string)choice["id"];var label=Button(content,(string)choice["label"],0,y,900,48,()=>Command("social-reply",new JObject{["threadId"]=thread,["choiceId"]=choiceId}));label.GetComponentInParent<Button>().interactable=alive&&choice["disabledReason"]==null;y+=56;}
            foreach(var group in view.World?["agency"]?["groups"] as JArray??new JArray())if((string)group["stage"]!="ended")
            {
                Label(content,"共同诉求："+group["concern"]+" · "+group["stage"],0,y,900,44,20);y+=48;
                var options=new[]{"listen","rest","food","fairness","refuse"};var labels=new[]{"听取诉求","安排休息","安排进食","减少这轮劳动","拒绝调整"};
                for(var i=0;i<options.Length;i++){var option=options[i];var id=group["id"].DeepClone();Button(content,labels[i],i*184,y,172,42,()=>Command("collective-reply",new JObject{["groupId"]=id,["choiceId"]=option}));}y+=54;
            }
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Math.Max(50,y));scroll.verticalNormalizedPosition=0;
            Button(body,"刷新交谈选项",0,0,240,44,()=>Open("伙伴互动"),true);
        }
        void Quit()
        {
            #if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying=false;
            #else
            Application.Quit();
            #endif
        }
        void GameSettings()
        {
            var version=panelVersion;modelStatus=Label(body,"正在读取已安装模型…",0,0,900,54,20);
            var viewport=Rect("模型列表",body,Vector2.zero,Vector2.one,new Vector2(0,200),new Vector2(0,-65));viewport.gameObject.AddComponent<RectMask2D>();var hit=viewport.gameObject.AddComponent<Image>();hit.color=Color.clear;
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;
            var content=Rect("可用模型",viewport,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-600),Vector2.zero);content.pivot=new Vector2(.5f,1);scroll.content=content;
            var y=0;
            void Model(string id,string label,bool available)
            {var text=Button(content,label+(available?"":" · 未安装"),0,y,890,48,()=>Action(new JObject{["type"]="agency-model",["modelId"]=id}));text.GetComponentInParent<Button>().interactable=available;y+=58;content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y);}
            Model("minimind3","MiniMind3",true);
            view.Authority?.Api("/game-api/native-models",null,(result,error)=>{
                if(version!=panelVersion)return;if(error!=null){modelStatus.text=error;return;}
                modelStatus.text="当前认知绑定："+((string)view.World?["agency"]?["modelId"]??"MiniMind3")+"\n本地模型加载状态："+result["status"]?["stage"];
                foreach(var model in result["models"] as JArray??new JArray())Model((string)model["id"],(string)model["name"],(bool?)model["available"]==true);
            });
            view.Authority?.Api("/game-api/remote-models",null,(result,error)=>{if(version!=panelVersion||error!=null)return;foreach(var model in result["models"] as JArray??new JArray())Model((string)model["id"],"远程 · "+model["name"],true);});
            void Agency(bool? enabled,bool? cognition){var agency=view.World?["agency"];Action(new JObject{["type"]="agency-settings",["enabled"]=enabled??(bool?)agency?["enabled"]??true,["cognition"]=cognition??(bool?)agency?["cognition"]??true,["modelId"]=agency?["modelId"]?.DeepClone()});}
            Button(body,"自主行为 开 / 关",0,140,280,44,()=>Agency(!((bool?)view.World?["agency"]?["enabled"]??true),null),true);
            Button(body,"大模型认知 开 / 关",300,140,280,44,()=>Agency(null,!((bool?)view.World?["agency"]?["cognition"]??true)),true);
            Button(body,"刷新本地模型",600,140,280,44,()=>Open("游戏设置"),true);
            Button(body,"远程模型配置",0,70,280,48,()=>Open("远程模型"),true);
            Button(body,"重置世界…",300,70,280,48,()=>Open("确认重置"),true);
            Button(body,"角色初始设置",600,70,280,48,()=>Open("角色初始设置"),true);
            Button(body,"开始新的旅程",0,15,280,40,()=>Open("开始旅程"),true);
            Label(body,"模型提供认知与表达，资源、行动及存档由世界规则裁决。",0,590,900,36,17);
        }
        string PartnerDescription(string category)
        {
            var npc=(view.World?["npcs"] as JArray)?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);if(npc==null)return "暂无伙伴状态";
            var lines=new List<string>{$"{npc["name"]} · {npc["role"]}",$"健康 {Number(npc["health"])} · 精力 {Number(npc["energy"])} · 饥饿 {Number(npc["hunger"])} · 信任 {Number(npc["trust"])}"};
            var mind=npc["mind"];var stance=(string)mind?["intent"]?["kind"];
            var stances=new Dictionary<string,string>{{"cooperate","愿意合作"},{"endure","勉强继续"},{"bargain","想谈条件"},{"evade","行动拖延"},{"rest","自行休息"},{"refuse","拒绝安排"},{"recruit","召集伙伴表达不满"},{"strike","停工中"}};
            if(stance!=null&&stances.TryGetValue(stance,out var description))lines.Add("当前可观察立场："+description);
            var social=view.World["social"];
            if(category=="性格与关系")
            {
                var config=new NativeNpcSettings();var values=npc["initialSettings"]?["values"];
                if(values!=null)foreach(var field in config.Fields.Where(f=>((string)f["id"]).StartsWith("trait.")))lines.Add(field["label"]+" "+((double?)values[(string)field["id"]]*((double?)field["displayScale"]??1)??0).ToString("0"));
                lines.Add("\n与其他伙伴的关系");
                foreach(var relation in social?["relationships"] as JArray??new JArray())if((string)relation["from"]==view.SelectedNpc)
                {var other=(view.World["npcs"] as JArray).FirstOrDefault(n=>(string)n["id"]==(string)relation["to"]);lines.Add($"{other?["name"]}：{Number(relation["affinity"])}");}
                lines.Add("\n承诺与兑现");
                foreach(var promise in social?["promises"] as JArray??new JArray())if((string)promise["npcId"]==view.SelectedNpc)
                {var labels=new Dictionary<string,string>{{"pending","待兑现"},{"kept","已兑现"},{"broken","已失约"},{"cancelled","已取消"}};var status=(string)promise["status"];lines.Add($"{((string)promise["kind"]=="meal"?"口粮":"休息")} · {(labels.TryGetValue(status,out var label)?label:status)}");}
            }
            else
            {
                lines.Add("\n亲历的事件与个人看法");
                var person=view.World["agency"]?["people"]?[view.SelectedNpc];
                if(person?["appraisal"] is JObject appraisal){lines.Add((string)appraisal["summary"]);lines.Add("当前目标："+appraisal["goal"]);}
                foreach(var memory in person?["memory"]?["recent"] as JArray??new JArray())lines.Add($"{memory["fact"]}\n{memory["interpretation"]}");
                foreach(var memory in social?["memories"] as JArray??new JArray())if((string)memory["npcId"]==view.SelectedNpc)lines.Add((string)memory["text"]);
            }
            return string.Join("\n\n",lines.Where(t=>!string.IsNullOrEmpty(t)));
        }
        void RemoteModels()
        {
            var version=panelVersion;var feedback=Label(body,"远程配置单独保存，重置世界后保留。",0,0,900,40,18);
            var id=Input(body,"配置 ID，例如 remote-my-model",0,55,430,"remote-my-model");var name=Input(body,"显示名称",460,55,430,"");
            var endpoint=Input(body,"OpenAI 兼容接口地址",0,115,890,"");var model=Input(body,"模型 ID",0,175,430,"");
            var key=Input(body,"API Key（留空保留已存密钥）",460,175,430,"");key.contentType=InputField.ContentType.Password;
            var config=new Func<JObject>(()=>new JObject{["id"]=id.text.Trim(),["name"]=name.text.Trim(),["baseUrl"]=endpoint.text.Trim(),["model"]=model.text.Trim(),["requiresKey"]=!string.IsNullOrEmpty(key.text)});
            var list=Scroll(body,"已保存远程模型",Vector2.zero,new Vector2(0,-360),out var listing);listing.GetComponent<ContentSizeFitter>().verticalFit=ContentSizeFitter.FitMode.Unconstrained;
            void Response(JObject result,string error){if(version!=panelVersion)return;feedback.text=error??"操作成功";if(result?["models"] is JArray models){foreach(Transform child in list)Destroy(child.gameObject);var row=0;foreach(var entry in models){var saved=entry;Button(list,$"{entry["name"]} · {entry["model"]}",0,row++*56,890,48,()=>{id.text=(string)saved["id"];name.text=(string)saved["name"];endpoint.text=(string)saved["baseUrl"];model.text=(string)saved["model"];key.text="";feedback.text=(bool?)saved["hasKey"]==true?"已存有密钥；留空保留原密钥":"尚未存储密钥";});}list.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Math.Max(50,row*56));}}
            JObject Draft(string action){var data=new JObject{["action"]=action,["config"]=config()};if(!string.IsNullOrEmpty(key.text))data["apiKey"]=key.text;return data;}
            Button(body,"保存配置",0,245,170,48,()=>view.Authority?.Api("/game-api/remote-models",Draft("save"),(result,error)=>{if(version!=panelVersion)return;Response(result,error);if(error==null)key.text="";}));
            Button(body,"测试连接",190,245,170,48,()=>{feedback.text="测试中…";view.Authority?.Api("/game-api/remote-models/test",Draft("test"),Response);});
            Button(body,"设为优先模型",380,245,200,48,()=>Action(new JObject{["type"]="agency-model",["modelId"]=id.text.Trim()}));
            Button(body,"删除配置",600,245,170,48,()=>{var removed=id.text.Trim();view.Authority?.Api("/game-api/remote-models",new JObject{["action"]="delete",["id"]=removed},(result,error)=>{if(version!=panelVersion)return;Response(result,error);if(error==null){key.text="";if((string)view.World?["agency"]?["modelId"]==removed)Action(new JObject{["type"]="agency-model",["modelId"]="minimind3"});}});});
            Button(body,"清除已存密钥",0,305,240,44,()=>{var data=Draft("save");data["apiKey"]="";view.Authority?.Api("/game-api/remote-models",data,(result,error)=>{if(version!=panelVersion)return;Response(result,error);if(error==null)key.text="";});});
            view.Authority?.Api("/game-api/remote-models",null,Response);
        }
        void NpcSettings()
        {
            settingsDirty=false;
            var config=new NativeNpcSettings();JObject draft;
            try{draft=config.Load();}catch(Exception e){Label(body,"配置读取失败："+e.Message,0,0,900,120,20);return;}
            var feedback=Label(body,"保存后仅新旅程生效，不覆盖当前伙伴状态。",0,0,900,40,18);
            var viewport=Rect("角色字段滚动区",body,Vector2.zero,Vector2.one,new Vector2(0,70),new Vector2(0,-110));viewport.gameObject.AddComponent<RectMask2D>();
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;
            var content=Rect("角色配置字段",viewport,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-850),Vector2.zero);content.pivot=new Vector2(.5f,1);scroll.content=content;
            var inputs=new Dictionary<string,InputField>();var selected=view.SelectedNpc;
            bool Read()
            {
                foreach(var field in config.Fields.Where(f=>(bool?)f["hidden"]!=true))
                {
                    var key=(string)field["id"];var scale=(double?)field["displayScale"]??1;
                    if(!double.TryParse(inputs[key].text,NumberStyles.Float,CultureInfo.InvariantCulture,out var value)){feedback.text="请输入有效数值："+field["label"];return false;}
                    draft["characters"][selected][key]=value/scale;
                }
                try{config.Validate(draft);return true;}catch(Exception e){feedback.text=e.Message;return false;}
            }
            void Render()
            {
                foreach(Transform child in content)Destroy(child.gameObject);inputs.Clear();var index=0;
                foreach(var field in config.Fields.Where(f=>(bool?)f["hidden"]!=true))
                {
                    var x=index%2*450;var y=index/2*88;var scale=(double?)field["displayScale"]??1;var key=(string)field["id"];
                    Label(content,(string)field["label"]+$"（{(double)field["min"]*scale:0}–{(double)field["max"]*scale:0}）",x,y,260,34,19);
                    inputs[key]=Input(content,(string)field["label"],x+275,y,150,((double)draft["characters"][selected][key]*scale).ToString("0.##",CultureInfo.InvariantCulture));
                    inputs[key].onValueChanged.AddListener(_=>settingsDirty=true);
                    Label(content,(string)field["description"],x,y+37,420,44,14);index++;
                }
            }
            for(var i=0;i<config.Characters.Count;i++){var character=config.Characters[i];var id=(string)character["id"];Button(body,(string)character["label"],i*101,50,94,40,()=>{if(!Read())return;selected=id;Render();});}
            Button(body,"保存初始设置",0,0,210,46,()=>{if(!Read())return;try{config.Save(draft);settingsDirty=false;feedback.text="已保存，下次新旅程生效";}catch(Exception e){feedback.text=e.Message;}},true);
            Button(body,"恢复当前角色默认",225,0,240,46,()=>{draft["characters"][selected]=config.Defaults["characters"][selected].DeepClone();Render();settingsDirty=true;},true);
            Button(body,"导入配置",480,0,160,46,()=>PickFile(false,"导入角色初始配置","",feedback,file=>{var value=JObject.Parse(File.ReadAllText(file));config.Validate(value);draft=value;Render();settingsDirty=true;feedback.text="已载入配置，点击保存后生效";}),true);
            Button(body,"导出配置",655,0,160,46,()=>{if(Read())PickFile(true,"导出角色初始配置","campmind-npc-settings.json",feedback,file=>File.WriteAllText(file,draft.ToString()));},true);Render();
        }
        void PickFile(bool save,string title,string name,Text feedback,Action<string> apply){StartCoroutine(PickFileRoutine(save,title,name,feedback,apply,panelVersion));}
        IEnumerator PickFileRoutine(bool save,string title,string name,Text feedback,Action<string> apply,int version)
        {
            Task<string> job;
            try{job=NativeFileDialog.Begin(()=>NativeFileDialog.Choose(save,title,name));}catch(Exception e){feedback.text=e.Message;yield break;}
            while(!job.IsCompleted)yield return null;
            if(version!=panelVersion||feedback==null)yield break;
            if(job.IsFaulted){feedback.text=job.Exception.GetBaseException().Message;yield break;}
            if(job.Result==null)yield break;
            try{apply(job.Result);}catch(Exception e){feedback.text=e.Message;}
        }
        static void Place(RectTransform rect,float x,float y,float width,float height){rect.anchorMin=rect.anchorMax=new Vector2(0,1);rect.offsetMin=new Vector2(x,-y-height);rect.offsetMax=new Vector2(x+width,-y);}
        void Icon(Transform owner,string asset,float x,float y,float size){var rect=At(asset,owner,x,y,size,size);var image=rect.gameObject.AddComponent<RawImage>();image.texture=Resources.Load<Texture2D>("Hud/"+asset);image.raycastTarget=false;}
        Text IconButton(Transform owner,string name,string asset,float x,float y,UnityEngine.Events.UnityAction action){var text=Button(owner,name,x,y,40,40,action);text.text="";Icon(text.transform.parent,asset,10,10,20);return text;}
        void Journey()
        {
            modal.offsetMin=new Vector2(-310,-430);modal.offsetMax=new Vector2(310,430);
            modalBlocker.GetComponent<Image>().color=new Color(.025f,.065f,.035f,.78f);
            Label(modal,view.World==null?"今晚，我们一起留下来。":"开启新的旅程",30,24,560,42,27);
            body=At("旅程内容",modal,30,80,560,750);
            var art=At("原版旅程插画",body,0,0,560,93);var artwork=art.gameObject.AddComponent<RawImage>();var texture=Resources.Load<Texture2D>("Hud/journey");artwork.texture=texture;var crop=(texture.width/(float)texture.height)/(560f/93);artwork.uvRect=new Rect(0,(1-crop)*.51f,1,crop);artwork.raycastTarget=false;
            Label(art,"松风营地 · 持续生存的荒野故事",20,60,520,24,11);
            Label(body,"九个伙伴，九种脾气，一座共同的村寨。\n分配工作，照顾彼此，在昼夜交替中建设营地。",0,110,560,60,14);
            var stepNames=new[]{"认识伙伴","一起劳作","建设营地"};var notes=new[]{"每个人都有自己的性格","采集、休息，也要互相照顾","储备物资，在昼夜中持续生存"};var stepIcons=new[]{"Users","Footprints","Flame"};
            for(var i=0;i<3;i++){Icon(body,stepIcons[i],i*190,184,20);Label(body,stepNames[i],i*190,214,180,23,12);Label(body,notes[i],i*190,242,180,35,10);}
            Label(body,"选择村寨生活节奏",0,290,550,22,11);
            var titles=new[]{"悠然村居","村寨求生","严酷生存"};var details=new[]{"更充足的物资，适合熟悉村寨","先保口粮，再安排日常分工","更大的消耗，考验补给与换班"};var ids=new[]{"cozy","normal","hard"};
            for(var i=0;i<3;i++){var id=ids[i];var t=Button(body,titles[i],0,320+i*65,560,57,()=>{journeyDifficulty=id;Open("开始旅程");});t.text=(journeyDifficulty==id?"✓  ":"    ")+titles[i]+"\n"+details[i];t.fontSize=12;t.alignment=TextAnchor.MiddleLeft;if(journeyDifficulty==id){t.GetComponentInParent<Button>().targetGraphic.color=new Color(.32f,.31f,.17f);t.color=new Color(.94f,.83f,.57f);}}
            Button(body,journeyAdvanced?"收起模型与场景设置":"模型与场景设置",0,520,560,32,()=>{journeyAdvanced=!journeyAdvanced;Open("开始旅程");}).fontSize=11;
            var y=560f;
            if(journeyAdvanced){modal.offsetMin=new Vector2(-310,-500);modal.offsetMax=new Vector2(310,500);var seed=Input(body,"世界种子",0,y,160,journeySeed);seed.onValueChanged.AddListener(v=>journeySeed=v);Button(body,"模型 / 规则",180,y,160,44,()=>journeyMode=journeyMode=="model"?"rules":"model");Button(body,"场景："+journeyScenario,360,y,200,44,()=>journeyScenario=journeyScenario=="standard"?"storm":journeyScenario=="storm"?"conflict":"standard");y+=70;}
            Button(body,"角色初始设置 · 性格 / 体能 / 技能",0,y,560,38,()=>Open("角色初始设置")).fontSize=12;
            Button(body,"游戏设置 · 对话模型",0,y+46,560,38,()=>Open("游戏设置")).fontSize=12;
            var error=Label(body,"",0,y+90,560,25,11);
            var start=Button(body,"确认开始新旅程",0,y+120,560,46,()=>{if(waitingForStart)return;if(!uint.TryParse(journeySeed,out var seed)||seed<1){error.text="请输入 1–4294967295 的世界种子";return;}try{startScope=view.Authority?.gate.Scope;waitingForStart=true;startDeadline=Time.unscaledTime+15;error.text="正在准备并保存村寨…";Action(new JObject{["type"]="start",["options"]=new JObject{["seed"]=seed,["mode"]=journeyMode,["difficulty"]=journeyDifficulty,["scenario"]=journeyScenario,["npcSettings"]=new NativeNpcSettings().Load()}});}catch(Exception e){waitingForStart=false;error.text=e.Message;}});start.text="进入村寨  →";start.fontSize=14;start.color=new Color(.14f,.2f,.12f);start.GetComponentInParent<Button>().targetGraphic.color=new Color(.92f,.76f,.42f);
            Label(body,"自动保存进度 · 支持鼠标与键盘",0,y+174,560,22,10);
        }
        RectTransform Rect(string name,Transform parent,Vector2 min,Vector2 max,Vector2 offsetMin,Vector2 offsetMax)
        {var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var rect=(RectTransform)go.transform;rect.anchorMin=min;rect.anchorMax=max;rect.offsetMin=offsetMin;rect.offsetMax=offsetMax;return rect;}
        RectTransform Panel(string name,Transform parent,Vector2 min,Vector2 max,Vector2 offsetMin,Vector2 offsetMax)
        {var rect=Rect(name,parent,min,max,offsetMin,offsetMax);var image=rect.gameObject.AddComponent<Image>();image.color=new Color(.078f,.16f,.118f,.96f);Round(image);return rect;}
        RectTransform At(string name,Transform parent,float x,float y,float width,float height,bool bottom=false)
        {return Rect(name,parent,new Vector2(0,bottom?0:1),new Vector2(0,bottom?0:1),new Vector2(x,bottom?y:-y-height),new Vector2(x+width,bottom?y+height:-y));}
        Text Label(Transform parent,string value,float x,float y,float width,float height,int size)
        {var rect=At(value,parent,x,y,width,height);var text=rect.gameObject.AddComponent<Text>();text.font=font;text.fontSize=size;text.color=new Color(.92f,.92f,.83f);text.text=value;text.supportRichText=false;text.raycastTarget=false;text.verticalOverflow=VerticalWrapMode.Overflow;return text;}
        Text Button(Transform parent,string name,float x,float y,float width,float height,UnityEngine.Events.UnityAction action,bool bottom=false)
        {var rect=At(name,parent,x,y,width,height,bottom);var image=rect.gameObject.AddComponent<Image>();image.color=new Color(.15f,.24f,.16f,.96f);Round(image);var button=rect.gameObject.AddComponent<Button>();button.targetGraphic=image;button.onClick.AddListener(()=>GetComponent<NativeGameAudio>()?.Click());button.onClick.AddListener(action);var text=Label(rect,name,4,2,width-8,height-4,18);text.alignment=TextAnchor.MiddleCenter;return text;}
        InputField Input(Transform parent,string name,float x,float y,float width,string initial)
        {var rect=At(name,parent,x,y,width,48);var image=rect.gameObject.AddComponent<Image>();image.color=new Color(.13f,.17f,.15f);var field=rect.gameObject.AddComponent<InputField>();field.targetGraphic=image;field.textComponent=Label(rect,"",10,6,width-20,36,20);field.text=initial;field.characterLimit=300;var placeholder=Label(rect,name,10,6,width-20,36,20);placeholder.color=new Color(.6f,.65f,.6f);field.placeholder=placeholder;return field;}
        RectTransform Scroll(Transform parent,string name,Vector2 min,Vector2 max,out Text text)
        {
            var viewport=Rect(name,parent,Vector2.zero,Vector2.one,min,max);viewport.gameObject.AddComponent<RectMask2D>();var hitArea=viewport.gameObject.AddComponent<Image>();hitArea.color=Color.clear;
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;
            var content=Rect("滚动内容",viewport,new Vector2(0,1),new Vector2(1,1),Vector2.zero,Vector2.zero);content.pivot=new Vector2(.5f,1);
            text=content.gameObject.AddComponent<Text>();text.font=font;text.fontSize=18;text.color=new Color(.9f,.91f,.84f);text.supportRichText=false;text.raycastTarget=true;text.horizontalOverflow=HorizontalWrapMode.Wrap;text.verticalOverflow=VerticalWrapMode.Overflow;
            var fit=content.gameObject.AddComponent<ContentSizeFitter>();fit.verticalFit=ContentSizeFitter.FitMode.PreferredSize;scroll.content=content;return content;
        }
    }
}
